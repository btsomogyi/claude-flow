/**
 * Event Manager
 * 
 * Provides unified event handling and webhook management for different project management platforms.
 * Supports event aggregation, filtering, transformation, and routing.
 */

import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import type {
  ProjectPlatform,
  ProjectEvent,
  EventType,
  EventSource,
  WebhookConfig,
  EventFilter,
  RetryConfig,
} from '../core/interfaces.js';

export interface EventManagerConfig {
  enableEventBuffering: boolean;
  bufferSize: number;
  bufferFlushInterval: number; // milliseconds
  enableEventPersistence: boolean;
  persistenceDirectory?: string;
  maxRetryAttempts: number;
  defaultRetryBackoff: number; // milliseconds
  enableEventTransformation: boolean;
  enableEventFiltering: boolean;
}

export interface EventHandler {
  id: string;
  name: string;
  eventTypes: EventType[];
  platforms?: ProjectPlatform[];
  filters?: EventFilter[];
  handler: (event: ProcessedEvent) => Promise<void> | void;
  priority: number; // Higher priority handlers execute first
  isAsync: boolean;
  isEnabled: boolean;
}

export interface ProcessedEvent extends ProjectEvent {
  processed: boolean;
  processedAt: Date;
  processingDuration: number;
  handlerResults: {
    handlerId: string;
    success: boolean;
    error?: string;
    duration: number;
  }[];
  retryCount: number;
  originalEvent: ProjectEvent;
}

export interface WebhookEndpoint {
  id: string;
  path: string;
  platform: ProjectPlatform;
  config: WebhookConfig;
  signature?: string;
  lastActivity?: Date;
  isActive: boolean;
}

export interface EventStats {
  totalEvents: number;
  eventsByType: Record<EventType, number>;
  eventsByPlatform: Record<ProjectPlatform, number>;
  successfulEvents: number;
  failedEvents: number;
  averageProcessingTime: number;
  activeHandlers: number;
  activeWebhooks: number;
}

export interface EventQuery {
  platforms?: ProjectPlatform[];
  types?: EventType[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  sources?: EventSource[];
  successful?: boolean;
  limit?: number;
  offset?: number;
}

export class EventManager extends EventEmitter {
  private config: EventManagerConfig;
  private eventHandlers: Map<string, EventHandler> = new Map();
  private webhookEndpoints: Map<string, WebhookEndpoint> = new Map();
  private eventBuffer: ProcessedEvent[] = [];
  private eventHistory: ProcessedEvent[] = [];
  private retryQueue: Map<string, ProcessedEvent> = new Map();
  private stats: EventStats;
  private bufferFlushTimer?: NodeJS.Timeout;

  constructor(config: Partial<EventManagerConfig> = {}) {
    super();
    
    this.config = {
      enableEventBuffering: true,
      bufferSize: 100,
      bufferFlushInterval: 5000,
      enableEventPersistence: false,
      maxRetryAttempts: 3,
      defaultRetryBackoff: 1000,
      enableEventTransformation: true,
      enableEventFiltering: true,
      ...config,
    };

    this.stats = {
      totalEvents: 0,
      eventsByType: {} as Record<EventType, number>,
      eventsByPlatform: {} as Record<ProjectPlatform, number>,
      successfulEvents: 0,
      failedEvents: 0,
      averageProcessingTime: 0,
      activeHandlers: 0,
      activeWebhooks: 0,
    };

    this.setupBufferFlushing();
  }

  // ========================================================================
  // INITIALIZATION AND CLEANUP
  // ========================================================================

  async initialize(): Promise<void> {
    if (this.config.enableEventPersistence && this.config.persistenceDirectory) {
      await this.loadEventHistory();
    }
    
    this.updateStats();
    this.emit('event_manager:initialized');
  }

  async shutdown(): Promise<void> {
    // Stop buffer flushing
    if (this.bufferFlushTimer) {
      clearInterval(this.bufferFlushTimer);
      this.bufferFlushTimer = undefined;
    }

    // Flush remaining events
    await this.flushEventBuffer();

    // Save event history if persistence is enabled
    if (this.config.enableEventPersistence) {
      await this.saveEventHistory();
    }

    this.emit('event_manager:shutdown');
  }

  // ========================================================================
  // EVENT HANDLING
  // ========================================================================

  async processEvent(event: ProjectEvent): Promise<ProcessedEvent> {
    const startTime = Date.now();
    
    const processedEvent: ProcessedEvent = {
      ...event,
      processed: false,
      processedAt: new Date(),
      processingDuration: 0,
      handlerResults: [],
      retryCount: 0,
      originalEvent: { ...event },
    };

    try {
      // Apply event transformations
      if (this.config.enableEventTransformation) {
        await this.transformEvent(processedEvent);
      }

      // Apply event filtering
      if (this.config.enableEventFiltering && !this.passesFilters(processedEvent)) {
        processedEvent.processed = true;
        processedEvent.processingDuration = Date.now() - startTime;
        this.updateStatsForEvent(processedEvent, false);
        return processedEvent;
      }

      // Get matching handlers
      const handlers = this.getMatchingHandlers(processedEvent);
      
      // Execute handlers
      await this.executeHandlers(processedEvent, handlers);

      processedEvent.processed = true;
      processedEvent.processingDuration = Date.now() - startTime;

      // Add to buffer/history
      await this.addToEventStore(processedEvent);

      // Update statistics
      this.updateStatsForEvent(processedEvent, true);

      this.emit('event:processed', processedEvent);
      return processedEvent;
    } catch (error) {
      processedEvent.processingDuration = Date.now() - startTime;
      this.updateStatsForEvent(processedEvent, false);
      
      this.emit('event:error', { event: processedEvent, error });
      throw error;
    }
  }

  async reprocessEvent(eventId: string): Promise<ProcessedEvent> {
    // Find event in history
    const event = this.eventHistory.find(e => e.id === eventId);
    if (!event) {
      throw new Error(`Event not found: ${eventId}`);
    }

    // Reset processing state
    const reprocessEvent: ProcessedEvent = {
      ...event.originalEvent,
      processed: false,
      processedAt: new Date(),
      processingDuration: 0,
      handlerResults: [],
      retryCount: event.retryCount + 1,
      originalEvent: event.originalEvent,
    };

    return this.processEvent(reprocessEvent);
  }

  // ========================================================================
  // EVENT HANDLER MANAGEMENT
  // ========================================================================

  registerHandler(handler: Omit<EventHandler, 'id'>): string {
    const id = this.generateHandlerId(handler.name);
    
    const eventHandler: EventHandler = {
      ...handler,
      id,
      isEnabled: handler.isEnabled !== false, // Default to true
    };

    this.eventHandlers.set(id, eventHandler);
    this.updateStats();

    this.emit('handler:registered', { id, name: handler.name });
    return id;
  }

  unregisterHandler(id: string): void {
    const handler = this.eventHandlers.get(id);
    if (!handler) {
      throw new Error(`Event handler not found: ${id}`);
    }

    this.eventHandlers.delete(id);
    this.updateStats();

    this.emit('handler:unregistered', { id, name: handler.name });
  }

  updateHandler(id: string, updates: Partial<EventHandler>): void {
    const handler = this.eventHandlers.get(id);
    if (!handler) {
      throw new Error(`Event handler not found: ${id}`);
    }

    const updatedHandler = { ...handler, ...updates };
    this.eventHandlers.set(id, updatedHandler);

    this.emit('handler:updated', { id, name: handler.name });
  }

  getHandler(id: string): EventHandler | null {
    return this.eventHandlers.get(id) || null;
  }

  listHandlers(): EventHandler[] {
    return Array.from(this.eventHandlers.values());
  }

  // ========================================================================
  // WEBHOOK MANAGEMENT
  // ========================================================================

  registerWebhookEndpoint(config: WebhookConfig): string {
    const id = this.generateWebhookId(config.platform);
    const path = `/webhooks/${config.platform}/${id}`;

    const endpoint: WebhookEndpoint = {
      id,
      path,
      platform: config.platform,
      config,
      signature: this.generateWebhookSignature(config),
      isActive: config.isActive,
    };

    this.webhookEndpoints.set(id, endpoint);
    this.updateStats();

    this.emit('webhook:registered', { id, platform: config.platform, path });
    return id;
  }

  unregisterWebhookEndpoint(id: string): void {
    const endpoint = this.webhookEndpoints.get(id);
    if (!endpoint) {
      throw new Error(`Webhook endpoint not found: ${id}`);
    }

    this.webhookEndpoints.delete(id);
    this.updateStats();

    this.emit('webhook:unregistered', { id, platform: endpoint.platform });
  }

  getWebhookEndpoint(id: string): WebhookEndpoint | null {
    return this.webhookEndpoints.get(id) || null;
  }

  getWebhookEndpointByPath(path: string): WebhookEndpoint | null {
    return Array.from(this.webhookEndpoints.values())
      .find(endpoint => endpoint.path === path) || null;
  }

  listWebhookEndpoints(platform?: ProjectPlatform): WebhookEndpoint[] {
    const endpoints = Array.from(this.webhookEndpoints.values());
    return platform ? endpoints.filter(e => e.platform === platform) : endpoints;
  }

  async handleWebhookRequest(
    path: string, 
    payload: any, 
    headers: Record<string, string>
  ): Promise<{ success: boolean; message: string }> {
    const endpoint = this.getWebhookEndpointByPath(path);
    if (!endpoint || !endpoint.isActive) {
      return { success: false, message: 'Webhook endpoint not found or inactive' };
    }

    try {
      // Verify webhook signature if configured
      if (endpoint.config.secret && !this.verifyWebhookSignature(payload, headers, endpoint.config.secret)) {
        return { success: false, message: 'Invalid webhook signature' };
      }

      // Transform webhook payload to unified event format
      const event = await this.transformWebhookToEvent(endpoint.platform, payload, headers);
      
      // Process the event
      await this.processEvent(event);

      // Update endpoint activity
      endpoint.lastActivity = new Date();
      this.webhookEndpoints.set(endpoint.id, endpoint);

      return { success: true, message: 'Webhook processed successfully' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown webhook processing error';
      this.emit('webhook:error', { endpoint: endpoint.id, error: errorMessage });
      return { success: false, message: errorMessage };
    }
  }

  // ========================================================================
  // EVENT QUERYING AND RETRIEVAL
  // ========================================================================

  queryEvents(query: EventQuery): ProcessedEvent[] {
    let events = [...this.eventHistory, ...this.eventBuffer];

    // Apply filters
    if (query.platforms && query.platforms.length > 0) {
      events = events.filter(e => query.platforms!.includes(e.platform));
    }

    if (query.types && query.types.length > 0) {
      events = events.filter(e => query.types!.includes(e.type));
    }

    if (query.dateRange) {
      events = events.filter(e => {
        const eventTime = e.timestamp.getTime();
        const startTime = query.dateRange!.start.getTime();
        const endTime = query.dateRange!.end.getTime();
        return eventTime >= startTime && eventTime <= endTime;
      });
    }

    if (query.sources && query.sources.length > 0) {
      events = events.filter(e => 
        query.sources!.some(source => 
          e.source.type === source.type && e.source.id === source.id
        )
      );
    }

    if (query.successful !== undefined) {
      events = events.filter(e => 
        query.successful ? e.handlerResults.every(r => r.success) : e.handlerResults.some(r => !r.success)
      );
    }

    // Sort by timestamp (newest first)
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    const start = query.offset || 0;
    const end = query.limit ? start + query.limit : events.length;

    return events.slice(start, end);
  }

  getEventById(id: string): ProcessedEvent | null {
    return this.eventHistory.find(e => e.id === id) || 
           this.eventBuffer.find(e => e.id === id) || null;
  }

  getEventStats(): EventStats {
    return { ...this.stats };
  }

  // ========================================================================
  // PRIVATE HELPER METHODS
  // ========================================================================

  private async transformEvent(event: ProcessedEvent): Promise<void> {
    // Apply platform-specific transformations
    switch (event.platform) {
      case 'github':
        await this.transformGitHubEvent(event);
        break;
      case 'jira':
        await this.transformJiraEvent(event);
        break;
      // Add other platform transformations as needed
    }

    // Apply general transformations
    event.metadata = event.metadata || {};
    event.metadata.transformedAt = new Date().toISOString();
  }

  private passesFilters(event: ProcessedEvent): boolean {
    // This is a placeholder for event filtering logic
    // In a real implementation, you would apply various filters based on configuration
    return true;
  }

  private getMatchingHandlers(event: ProcessedEvent): EventHandler[] {
    return Array.from(this.eventHandlers.values())
      .filter(handler => 
        handler.isEnabled &&
        handler.eventTypes.includes(event.type) &&
        (!handler.platforms || handler.platforms.includes(event.platform)) &&
        this.eventMatchesFilters(event, handler.filters || [])
      )
      .sort((a, b) => b.priority - a.priority); // Higher priority first
  }

  private eventMatchesFilters(event: ProcessedEvent, filters: EventFilter[]): boolean {
    if (filters.length === 0) return true;

    return filters.every(filter => {
      const fieldValue = this.getEventFieldValue(event, filter.field);
      
      switch (filter.operator) {
        case 'equals':
          return fieldValue === filter.value;
        case 'contains':
          return typeof fieldValue === 'string' && fieldValue.includes(filter.value);
        case 'startsWith':
          return typeof fieldValue === 'string' && fieldValue.startsWith(filter.value);
        case 'regex':
          return typeof fieldValue === 'string' && new RegExp(filter.value).test(fieldValue);
        default:
          return false;
      }
    });
  }

  private getEventFieldValue(event: ProcessedEvent, field: string): any {
    // Support dot notation for nested fields
    const fields = field.split('.');
    let value: any = event;

    for (const f of fields) {
      value = value?.[f];
      if (value === undefined) break;
    }

    return value;
  }

  private async executeHandlers(event: ProcessedEvent, handlers: EventHandler[]): Promise<void> {
    const handlerPromises = handlers.map(async handler => {
      const startTime = Date.now();
      
      try {
        if (handler.isAsync) {
          await handler.handler(event);
        } else {
          handler.handler(event);
        }

        const result = {
          handlerId: handler.id,
          success: true,
          duration: Date.now() - startTime,
        };

        event.handlerResults.push(result);
        this.emit('handler:success', { handler: handler.id, event: event.id, duration: result.duration });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown handler error';
        const result = {
          handlerId: handler.id,
          success: false,
          error: errorMessage,
          duration: Date.now() - startTime,
        };

        event.handlerResults.push(result);
        this.emit('handler:error', { handler: handler.id, event: event.id, error: errorMessage });

        // Add to retry queue if configured
        if (this.config.maxRetryAttempts > 0 && event.retryCount < this.config.maxRetryAttempts) {
          this.scheduleRetry(event);
        }
      }
    });

    await Promise.all(handlerPromises);
  }

  private async addToEventStore(event: ProcessedEvent): Promise<void> {
    if (this.config.enableEventBuffering) {
      this.eventBuffer.push(event);
      
      if (this.eventBuffer.length >= this.config.bufferSize) {
        await this.flushEventBuffer();
      }
    } else {
      this.eventHistory.push(event);
    }
  }

  private setupBufferFlushing(): void {
    if (this.config.enableEventBuffering) {
      this.bufferFlushTimer = setInterval(async () => {
        await this.flushEventBuffer();
      }, this.config.bufferFlushInterval);
    }
  }

  private async flushEventBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    // Move to history
    this.eventHistory.push(...events);

    // Keep history size manageable
    const maxHistorySize = 10000;
    if (this.eventHistory.length > maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-maxHistorySize);
    }

    this.emit('events:flushed', { count: events.length });
  }

  private scheduleRetry(event: ProcessedEvent): void {
    const retryDelay = this.config.defaultRetryBackoff * Math.pow(2, event.retryCount);
    
    setTimeout(async () => {
      try {
        await this.reprocessEvent(event.id);
      } catch (error) {
        this.emit('retry:failed', { event: event.id, error });
      }
    }, retryDelay);
  }

  private updateStats(): void {
    this.stats.activeHandlers = Array.from(this.eventHandlers.values())
      .filter(h => h.isEnabled).length;
    
    this.stats.activeWebhooks = Array.from(this.webhookEndpoints.values())
      .filter(w => w.isActive).length;
  }

  private updateStatsForEvent(event: ProcessedEvent, success: boolean): void {
    this.stats.totalEvents++;
    
    // Update by type
    this.stats.eventsByType[event.type] = (this.stats.eventsByType[event.type] || 0) + 1;
    
    // Update by platform
    this.stats.eventsByPlatform[event.platform] = (this.stats.eventsByPlatform[event.platform] || 0) + 1;
    
    // Update success/failure
    if (success) {
      this.stats.successfulEvents++;
    } else {
      this.stats.failedEvents++;
    }

    // Update average processing time
    const totalTime = this.stats.averageProcessingTime * (this.stats.totalEvents - 1) + event.processingDuration;
    this.stats.averageProcessingTime = totalTime / this.stats.totalEvents;
  }

  private generateHandlerId(name: string): string {
    return `handler-${name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateWebhookId(platform: ProjectPlatform): string {
    return `webhook-${platform}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateWebhookSignature(config: WebhookConfig): string {
    if (!config.secret) return '';
    
    const data = `${config.platform}-${config.url}-${Date.now()}`;
    return createHash('sha256').update(data + config.secret).digest('hex');
  }

  private verifyWebhookSignature(payload: any, headers: Record<string, string>, secret: string): boolean {
    const signature = headers['x-hub-signature-256'] || headers['x-signature-256'];
    if (!signature) return false;

    const expectedSignature = createHash('sha256')
      .update(JSON.stringify(payload) + secret)
      .digest('hex');

    return signature === `sha256=${expectedSignature}`;
  }

  private async transformWebhookToEvent(
    platform: ProjectPlatform, 
    payload: any, 
    headers: Record<string, string>
  ): Promise<ProjectEvent> {
    // This would contain platform-specific webhook payload transformations
    const baseEvent: ProjectEvent = {
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'custom', // Would be determined from payload
      platform,
      timestamp: new Date(),
      source: {
        type: 'webhook',
        id: `webhook-${platform}`,
        name: `${platform} Webhook`,
      },
      data: payload,
      metadata: {
        headers,
        receivedAt: new Date().toISOString(),
      },
    };

    switch (platform) {
      case 'github':
        return this.transformGitHubWebhook(baseEvent, payload, headers);
      case 'jira':
        return this.transformJiraWebhook(baseEvent, payload, headers);
      default:
        return baseEvent;
    }
  }

  private transformGitHubWebhook(baseEvent: ProjectEvent, payload: any, headers: Record<string, string>): ProjectEvent {
    const eventType = headers['x-github-event'] || 'unknown';
    
    // Map GitHub event types to our unified types
    const typeMapping: Record<string, EventType> = {
      'issues': payload.action === 'opened' ? 'issue.created' : 
               payload.action === 'closed' ? 'issue.updated' :
               payload.action === 'edited' ? 'issue.updated' : 'issue.updated',
      'issue_comment': payload.action === 'created' ? 'comment.created' :
                      payload.action === 'edited' ? 'comment.updated' :
                      payload.action === 'deleted' ? 'comment.deleted' : 'comment.updated',
      'project': 'project.updated',
    };

    return {
      ...baseEvent,
      type: typeMapping[eventType] || 'custom',
      data: {
        ...payload,
        githubEventType: eventType,
      },
    };
  }

  private transformJiraWebhook(baseEvent: ProjectEvent, payload: any, headers: Record<string, string>): ProjectEvent {
    const eventType = payload.webhookEvent || 'unknown';
    
    // Map Jira event types to our unified types
    const typeMapping: Record<string, EventType> = {
      'jira:issue_created': 'issue.created',
      'jira:issue_updated': 'issue.updated',
      'jira:issue_deleted': 'issue.deleted',
      'comment_created': 'comment.created',
      'comment_updated': 'comment.updated',
      'comment_deleted': 'comment.deleted',
      'project_created': 'project.created',
      'project_updated': 'project.updated',
      'project_deleted': 'project.deleted',
    };

    return {
      ...baseEvent,
      type: typeMapping[eventType] || 'custom',
      data: {
        ...payload,
        jiraEventType: eventType,
      },
    };
  }

  private async transformGitHubEvent(event: ProcessedEvent): Promise<void> {
    // GitHub-specific event transformations
    if (event.data && event.data.repository) {
      event.metadata.repository = {
        id: event.data.repository.id,
        name: event.data.repository.full_name,
        url: event.data.repository.html_url,
      };
    }
  }

  private async transformJiraEvent(event: ProcessedEvent): Promise<void> {
    // Jira-specific event transformations
    if (event.data && event.data.issue) {
      event.metadata.issue = {
        id: event.data.issue.id,
        key: event.data.issue.key,
        url: event.data.issue.self,
      };
    }
  }

  private async loadEventHistory(): Promise<void> {
    // Implementation for loading persisted events
    // This would read from the configured persistence directory
  }

  private async saveEventHistory(): Promise<void> {
    // Implementation for saving events to persistent storage
    // This would write to the configured persistence directory
  }
}