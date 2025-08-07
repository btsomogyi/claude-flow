/**
 * Unified Project Management Service
 * 
 * This service provides a unified interface for project management operations
 * across multiple platforms (GitHub, Jira, etc.) using the adapter pattern.
 */

import { EventEmitter } from 'events';
import type {
  ProjectPlatform,
  PlatformAdapter,
  Project,
  Issue,
  Board,
  ProjectQuery,
  IssueQuery,
  CreateProjectRequest,
  UpdateProjectRequest,
  CreateIssueRequest,
  UpdateIssueRequest,
  BulkOperation,
  ProjectEvent,
  WebhookConfig,
  AuthConfig,
  PlatformCapabilities,
} from './interfaces.js';

export interface UnifiedProjectManagerConfig {
  defaultPlatform?: ProjectPlatform;
  enableEventAggregation: boolean;
  enableCaching: boolean;
  cacheConfig?: {
    ttl: number; // milliseconds
    maxSize: number;
    enablePersistence: boolean;
  };
  retryConfig?: {
    maxRetries: number;
    backoffMultiplier: number;
    maxBackoffTime: number;
  };
  logging?: {
    enabled: boolean;
    level: 'debug' | 'info' | 'warn' | 'error';
  };
}

export interface AdapterRegistration {
  adapter: PlatformAdapter;
  config: AuthConfig;
  isDefault?: boolean;
  isEnabled?: boolean;
  priority?: number; // Higher priority adapters are preferred for cross-platform operations
}

export interface CrossPlatformQuery {
  platforms?: ProjectPlatform[];
  mergeResults?: boolean;
  preferredPlatform?: ProjectPlatform;
  fallbackPlatforms?: ProjectPlatform[];
}

export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: Error;
  platform: ProjectPlatform;
  timestamp: Date;
  duration: number; // milliseconds
  cached?: boolean;
}

export interface AggregatedResult<T = any> {
  results: OperationResult<T>[];
  merged?: T[];
  summary: {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    averageDuration: number;
    platformsUsed: ProjectPlatform[];
  };
}

export class UnifiedProjectManager extends EventEmitter {
  private adapters: Map<ProjectPlatform, AdapterRegistration> = new Map();
  private cache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();
  private config: UnifiedProjectManagerConfig;
  private webhookConfigs: Map<string, WebhookConfig> = new Map();
  private eventAggregator: EventAggregator;

  constructor(config: UnifiedProjectManagerConfig) {
    super();
    this.config = {
      enableEventAggregation: true,
      enableCaching: false,
      ...config,
    };

    this.eventAggregator = new EventAggregator(this);
    this.setupEventHandling();
    this.startCacheCleanup();
  }

  // ========================================================================
  // ADAPTER MANAGEMENT
  // ========================================================================

  /**
   * Register a platform adapter
   */
  async registerAdapter(registration: AdapterRegistration): Promise<void> {
    const { adapter, config, isDefault = false, isEnabled = true } = registration;

    try {
      // Connect the adapter
      if (isEnabled) {
        await adapter.connect(config);
        const connectionTest = await adapter.testConnection();
        if (!connectionTest) {
          throw new Error(`Failed to establish connection to ${adapter.platform}`);
        }
      }

      this.adapters.set(adapter.platform, {
        ...registration,
        isEnabled,
      });

      if (isDefault) {
        this.config.defaultPlatform = adapter.platform;
      }

      this.emit('adapter:registered', { platform: adapter.platform, capabilities: adapter.capabilities });
      this.log('info', `Adapter registered for ${adapter.platform}`);
    } catch (error) {
      this.log('error', `Failed to register adapter for ${adapter.platform}`, error);
      throw error;
    }
  }

  /**
   * Unregister a platform adapter
   */
  async unregisterAdapter(platform: ProjectPlatform): Promise<void> {
    const registration = this.adapters.get(platform);
    if (!registration) {
      throw new Error(`Adapter not found for platform: ${platform}`);
    }

    try {
      await registration.adapter.disconnect();
      this.adapters.delete(platform);
      
      if (this.config.defaultPlatform === platform) {
        this.config.defaultPlatform = this.adapters.keys().next().value;
      }

      this.emit('adapter:unregistered', { platform });
      this.log('info', `Adapter unregistered for ${platform}`);
    } catch (error) {
      this.log('error', `Failed to unregister adapter for ${platform}`, error);
      throw error;
    }
  }

  /**
   * Get registered adapters
   */
  getAdapters(): Map<ProjectPlatform, AdapterRegistration> {
    return new Map(this.adapters);
  }

  /**
   * Get capabilities for all registered adapters
   */
  getCapabilities(): Map<ProjectPlatform, PlatformCapabilities> {
    const capabilities = new Map<ProjectPlatform, PlatformCapabilities>();
    
    for (const [platform, registration] of this.adapters) {
      if (registration.isEnabled) {
        capabilities.set(platform, registration.adapter.capabilities);
      }
    }

    return capabilities;
  }

  // ========================================================================
  // PROJECT OPERATIONS
  // ========================================================================

  /**
   * Create a project on specified platform(s)
   */
  async createProject(
    request: CreateProjectRequest,
    platform?: ProjectPlatform
  ): Promise<OperationResult<Project>> {
    const targetPlatform = platform || this.config.defaultPlatform;
    if (!targetPlatform) {
      throw new Error('No platform specified and no default platform configured');
    }

    const adapter = this.getAdapter(targetPlatform);
    const startTime = Date.now();

    try {
      const project = await adapter.createProject(request);
      const result: OperationResult<Project> = {
        success: true,
        data: project,
        platform: targetPlatform,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };

      this.emit('project:created', { project, platform: targetPlatform });
      return result;
    } catch (error) {
      const result: OperationResult<Project> = {
        success: false,
        error: error as Error,
        platform: targetPlatform,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };

      this.emit('project:create_failed', { error, platform: targetPlatform });
      return result;
    }
  }

  /**
   * Get a project by ID from specified platform(s)
   */
  async getProject(
    id: string,
    platform?: ProjectPlatform,
    crossPlatform?: CrossPlatformQuery
  ): Promise<OperationResult<Project> | AggregatedResult<Project>> {
    if (crossPlatform?.platforms && crossPlatform.platforms.length > 1) {
      return this.getCrossProjectProject(id, crossPlatform);
    }

    const targetPlatform = platform || this.config.defaultPlatform;
    if (!targetPlatform) {
      throw new Error('No platform specified and no default platform configured');
    }

    const cacheKey = `project:${targetPlatform}:${id}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return {
        success: true,
        data: cached,
        platform: targetPlatform,
        timestamp: new Date(),
        duration: 0,
        cached: true,
      };
    }

    const adapter = this.getAdapter(targetPlatform);
    const startTime = Date.now();

    try {
      const project = await adapter.getProject(id);
      const result: OperationResult<Project> = {
        success: true,
        data: project || undefined,
        platform: targetPlatform,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };

      if (project) {
        this.setCache(cacheKey, project);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        platform: targetPlatform,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Update a project
   */
  async updateProject(
    id: string,
    request: UpdateProjectRequest,
    platform?: ProjectPlatform
  ): Promise<OperationResult<Project>> {
    const targetPlatform = platform || this.config.defaultPlatform;
    if (!targetPlatform) {
      throw new Error('No platform specified and no default platform configured');
    }

    const adapter = this.getAdapter(targetPlatform);
    const startTime = Date.now();

    try {
      const project = await adapter.updateProject(id, request);
      const result: OperationResult<Project> = {
        success: true,
        data: project,
        platform: targetPlatform,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };

      // Invalidate cache
      const cacheKey = `project:${targetPlatform}:${id}`;
      this.invalidateCache(cacheKey);

      this.emit('project:updated', { project, platform: targetPlatform });
      return result;
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        platform: targetPlatform,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Delete a project
   */
  async deleteProject(
    id: string,
    platform?: ProjectPlatform
  ): Promise<OperationResult<void>> {
    const targetPlatform = platform || this.config.defaultPlatform;
    if (!targetPlatform) {
      throw new Error('No platform specified and no default platform configured');
    }

    const adapter = this.getAdapter(targetPlatform);
    const startTime = Date.now();

    try {
      await adapter.deleteProject(id);
      const result: OperationResult<void> = {
        success: true,
        platform: targetPlatform,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };

      // Invalidate cache
      const cacheKey = `project:${targetPlatform}:${id}`;
      this.invalidateCache(cacheKey);

      this.emit('project:deleted', { projectId: id, platform: targetPlatform });
      return result;
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        platform: targetPlatform,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * List projects with optional cross-platform aggregation
   */
  async listProjects(
    query?: ProjectQuery & CrossPlatformQuery
  ): Promise<OperationResult<Project[]> | AggregatedResult<Project>> {
    const platforms = query?.platforms || [this.config.defaultPlatform!].filter(Boolean);
    
    if (platforms.length === 0) {
      throw new Error('No platforms available for listing projects');
    }

    if (platforms.length === 1) {
      return this.listProjectsForPlatform(platforms[0], query);
    }

    // Cross-platform query
    const operations = platforms.map(platform => 
      this.listProjectsForPlatform(platform, query)
    );

    const results = await Promise.allSettled(operations);
    const operationResults: OperationResult<Project[]>[] = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          error: result.reason,
          platform: platforms[index],
          timestamp: new Date(),
          duration: 0,
        };
      }
    });

    return this.aggregateResults(operationResults, query?.mergeResults);
  }

  // ========================================================================
  // ISSUE OPERATIONS
  // ========================================================================

  /**
   * Create an issue
   */
  async createIssue(
    request: CreateIssueRequest,
    platform?: ProjectPlatform
  ): Promise<OperationResult<Issue>> {
    const targetPlatform = platform || this.config.defaultPlatform;
    if (!targetPlatform) {
      throw new Error('No platform specified and no default platform configured');
    }

    const adapter = this.getAdapter(targetPlatform);
    const startTime = Date.now();

    try {
      const issue = await adapter.createIssue(request);
      const result: OperationResult<Issue> = {
        success: true,
        data: issue,
        platform: targetPlatform,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };

      this.emit('issue:created', { issue, platform: targetPlatform });
      return result;
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        platform: targetPlatform,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Get an issue by ID
   */
  async getIssue(
    id: string,
    platform?: ProjectPlatform,
    crossPlatform?: CrossPlatformQuery
  ): Promise<OperationResult<Issue> | AggregatedResult<Issue>> {
    if (crossPlatform?.platforms && crossPlatform.platforms.length > 1) {
      return this.getCrossPlatformIssue(id, crossPlatform);
    }

    const targetPlatform = platform || this.config.defaultPlatform;
    if (!targetPlatform) {
      throw new Error('No platform specified and no default platform configured');
    }

    const cacheKey = `issue:${targetPlatform}:${id}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return {
        success: true,
        data: cached,
        platform: targetPlatform,
        timestamp: new Date(),
        duration: 0,
        cached: true,
      };
    }

    const adapter = this.getAdapter(targetPlatform);
    const startTime = Date.now();

    try {
      const issue = await adapter.getIssue(id);
      const result: OperationResult<Issue> = {
        success: true,
        data: issue || undefined,
        platform: targetPlatform,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };

      if (issue) {
        this.setCache(cacheKey, issue);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        platform: targetPlatform,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Update an issue
   */
  async updateIssue(
    id: string,
    request: UpdateIssueRequest,
    platform?: ProjectPlatform
  ): Promise<OperationResult<Issue>> {
    const targetPlatform = platform || this.config.defaultPlatform;
    if (!targetPlatform) {
      throw new Error('No platform specified and no default platform configured');
    }

    const adapter = this.getAdapter(targetPlatform);
    const startTime = Date.now();

    try {
      const issue = await adapter.updateIssue(id, request);
      const result: OperationResult<Issue> = {
        success: true,
        data: issue,
        platform: targetPlatform,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };

      // Invalidate cache
      const cacheKey = `issue:${targetPlatform}:${id}`;
      this.invalidateCache(cacheKey);

      this.emit('issue:updated', { issue, platform: targetPlatform });
      return result;
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        platform: targetPlatform,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * List issues with optional cross-platform aggregation
   */
  async listIssues(
    query?: IssueQuery & CrossPlatformQuery
  ): Promise<OperationResult<Issue[]> | AggregatedResult<Issue>> {
    const platforms = query?.platforms || [this.config.defaultPlatform!].filter(Boolean);
    
    if (platforms.length === 0) {
      throw new Error('No platforms available for listing issues');
    }

    if (platforms.length === 1) {
      return this.listIssuesForPlatform(platforms[0], query);
    }

    // Cross-platform query
    const operations = platforms.map(platform => 
      this.listIssuesForPlatform(platform, query)
    );

    const results = await Promise.allSettled(operations);
    const operationResults: OperationResult<Issue[]>[] = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          error: result.reason,
          platform: platforms[index],
          timestamp: new Date(),
          duration: 0,
        };
      }
    });

    return this.aggregateResults(operationResults, query?.mergeResults);
  }

  // ========================================================================
  // BULK OPERATIONS
  // ========================================================================

  /**
   * Perform bulk operations on issues
   */
  async bulkUpdateIssues(
    operation: BulkOperation<UpdateIssueRequest>,
    platform?: ProjectPlatform
  ): Promise<OperationResult<Issue[]>> {
    const targetPlatform = platform || this.config.defaultPlatform;
    if (!targetPlatform) {
      throw new Error('No platform specified and no default platform configured');
    }

    const adapter = this.getAdapter(targetPlatform);
    const startTime = Date.now();

    try {
      const issues = await adapter.bulkUpdateIssues(operation);
      const result: OperationResult<Issue[]> = {
        success: true,
        data: issues,
        platform: targetPlatform,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };

      // Invalidate cache for all affected issues
      operation.targets.forEach(id => {
        const cacheKey = `issue:${targetPlatform}:${id}`;
        this.invalidateCache(cacheKey);
      });

      this.emit('issues:bulk_updated', { operation, issues, platform: targetPlatform });
      return result;
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        platform: targetPlatform,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };
    }
  }

  // ========================================================================
  // SEARCH OPERATIONS
  // ========================================================================

  /**
   * Search across platforms
   */
  async searchIssues(
    query: string,
    filters?: Record<string, any> & CrossPlatformQuery
  ): Promise<OperationResult<Issue[]> | AggregatedResult<Issue>> {
    const platforms = filters?.platforms || [this.config.defaultPlatform!].filter(Boolean);
    
    if (platforms.length === 0) {
      throw new Error('No platforms available for search');
    }

    if (platforms.length === 1) {
      return this.searchIssuesForPlatform(platforms[0], query, filters);
    }

    // Cross-platform search
    const operations = platforms.map(platform => 
      this.searchIssuesForPlatform(platform, query, filters)
    );

    const results = await Promise.allSettled(operations);
    const operationResults: OperationResult<Issue[]>[] = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          error: result.reason,
          platform: platforms[index],
          timestamp: new Date(),
          duration: 0,
        };
      }
    });

    return this.aggregateResults(operationResults, filters?.mergeResults);
  }

  // ========================================================================
  // PRIVATE HELPER METHODS
  // ========================================================================

  private getAdapter(platform: ProjectPlatform): PlatformAdapter {
    const registration = this.adapters.get(platform);
    if (!registration) {
      throw new Error(`Adapter not found for platform: ${platform}`);
    }
    if (!registration.isEnabled) {
      throw new Error(`Adapter is disabled for platform: ${platform}`);
    }
    return registration.adapter;
  }

  private async listProjectsForPlatform(
    platform: ProjectPlatform,
    query?: ProjectQuery
  ): Promise<OperationResult<Project[]>> {
    const adapter = this.getAdapter(platform);
    const startTime = Date.now();

    try {
      const projects = await adapter.listProjects(query);
      return {
        success: true,
        data: projects,
        platform,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        platform,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };
    }
  }

  private async listIssuesForPlatform(
    platform: ProjectPlatform,
    query?: IssueQuery
  ): Promise<OperationResult<Issue[]>> {
    const adapter = this.getAdapter(platform);
    const startTime = Date.now();

    try {
      const issues = await adapter.listIssues(query);
      return {
        success: true,
        data: issues,
        platform,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        platform,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };
    }
  }

  private async searchIssuesForPlatform(
    platform: ProjectPlatform,
    query: string,
    filters?: Record<string, any>
  ): Promise<OperationResult<Issue[]>> {
    const adapter = this.getAdapter(platform);
    const startTime = Date.now();

    try {
      const issues = await adapter.searchIssues(query, filters);
      return {
        success: true,
        data: issues,
        platform,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        platform,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };
    }
  }

  private async getCrossProjectProject(
    id: string,
    crossPlatform: CrossPlatformQuery
  ): Promise<AggregatedResult<Project>> {
    const operations = crossPlatform.platforms!.map(platform => 
      this.getProject(id, platform) as Promise<OperationResult<Project>>
    );

    const results = await Promise.allSettled(operations);
    const operationResults: OperationResult<Project>[] = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          error: result.reason,
          platform: crossPlatform.platforms![index],
          timestamp: new Date(),
          duration: 0,
        };
      }
    });

    return this.aggregateResults(operationResults, crossPlatform.mergeResults);
  }

  private async getCrossPlatformIssue(
    id: string,
    crossPlatform: CrossPlatformQuery
  ): Promise<AggregatedResult<Issue>> {
    const operations = crossPlatform.platforms!.map(platform => 
      this.getIssue(id, platform) as Promise<OperationResult<Issue>>
    );

    const results = await Promise.allSettled(operations);
    const operationResults: OperationResult<Issue>[] = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          error: result.reason,
          platform: crossPlatform.platforms![index],
          timestamp: new Date(),
          duration: 0,
        };
      }
    });

    return this.aggregateResults(operationResults, crossPlatform.mergeResults);
  }

  private aggregateResults<T>(
    results: OperationResult<T[]>[],
    mergeResults: boolean = false
  ): AggregatedResult<T> {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    const aggregated: AggregatedResult<T> = {
      results,
      summary: {
        totalOperations: results.length,
        successfulOperations: successful.length,
        failedOperations: failed.length,
        averageDuration: totalDuration / results.length,
        platformsUsed: results.map(r => r.platform),
      },
    };

    if (mergeResults && successful.length > 0) {
      aggregated.merged = successful
        .filter(r => r.data)
        .flatMap(r => r.data!);
    }

    return aggregated;
  }

  // ========================================================================
  // CACHING
  // ========================================================================

  private getFromCache(key: string): any {
    if (!this.config.enableCaching) return null;

    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  private setCache(key: string, data: any): void {
    if (!this.config.enableCaching) return;

    const ttl = this.config.cacheConfig?.ttl || 5 * 60 * 1000; // 5 minutes default
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });

    // Respect max size
    const maxSize = this.config.cacheConfig?.maxSize || 1000;
    if (this.cache.size > maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  private invalidateCache(key: string): void {
    this.cache.delete(key);
  }

  private startCacheCleanup(): void {
    if (!this.config.enableCaching) return;

    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache.entries()) {
        if (now > entry.timestamp + entry.ttl) {
          this.cache.delete(key);
        }
      }
    }, 60000); // Cleanup every minute
  }

  // ========================================================================
  // EVENT HANDLING
  // ========================================================================

  private setupEventHandling(): void {
    if (this.config.enableEventAggregation) {
      this.eventAggregator.start();
    }
  }

  // ========================================================================
  // LOGGING
  // ========================================================================

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, error?: any): void {
    if (!this.config.logging?.enabled) return;

    const logLevel = this.config.logging.level || 'info';
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };

    if (levels[level] >= levels[logLevel]) {
      console[level](`[UnifiedProjectManager] ${message}`, error ? error : '');
    }
  }
}

// ========================================================================
// EVENT AGGREGATOR
// ========================================================================

class EventAggregator {
  private manager: UnifiedProjectManager;
  private eventBuffer: ProjectEvent[] = [];
  private bufferSize = 100;
  private flushInterval = 5000; // 5 seconds
  private flushTimer?: NodeJS.Timeout;

  constructor(manager: UnifiedProjectManager) {
    this.manager = manager;
  }

  start(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    this.flush();
  }

  addEvent(event: ProjectEvent): void {
    this.eventBuffer.push(event);
    if (this.eventBuffer.length >= this.bufferSize) {
      this.flush();
    }
  }

  private flush(): void {
    if (this.eventBuffer.length === 0) return;

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    this.manager.emit('events:batch', events);
  }
}