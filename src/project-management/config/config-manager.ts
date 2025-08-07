/**
 * Configuration Manager
 * 
 * Provides unified configuration management for the project management system.
 * Supports multiple configuration sources, validation, and environment-specific settings.
 */

import { EventEmitter } from 'events';
import { writeFile, readFile, mkdir, watch } from 'fs/promises';
import { join } from 'path';
import * as yaml from 'yaml';
import type {
  ProjectPlatform,
  AuthConfig,
  PlatformCapabilities,
} from '../core/interfaces.js';

export interface ConfigManagerOptions {
  configDirectory: string;
  enableFileWatching: boolean;
  enableEnvironmentOverrides: boolean;
  enableValidation: boolean;
  defaultConfigFile?: string;
  environmentPrefix: string; // e.g., 'CLAUDE_FLOW'
}

export interface UnifiedConfig {
  version: string;
  environment: 'development' | 'staging' | 'production' | 'test';
  
  // Core Settings
  core: {
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    enableMetrics: boolean;
    enableTelemetry: boolean;
    maxConcurrentOperations: number;
    operationTimeout: number; // milliseconds
    retryAttempts: number;
    retryBackoff: number; // milliseconds
  };

  // Platform Configurations
  platforms: {
    [K in ProjectPlatform]?: PlatformConfig;
  };

  // Authentication Settings
  authentication: {
    storageDirectory: string;
    encryptionEnabled: boolean;
    encryptionKey?: string;
    tokenRefreshBuffer: number; // minutes
    maxRetryAttempts: number;
    enableAutoRefresh: boolean;
  };

  // Event System Configuration
  events: {
    enableEventBuffering: boolean;
    bufferSize: number;
    bufferFlushInterval: number;
    enableEventPersistence: boolean;
    persistenceDirectory?: string;
    maxRetryAttempts: number;
    defaultRetryBackoff: number;
    enableEventTransformation: boolean;
    enableEventFiltering: boolean;
  };

  // Caching Configuration
  cache: {
    enabled: boolean;
    ttl: number; // milliseconds
    maxSize: number;
    enablePersistence: boolean;
    persistenceDirectory?: string;
    cleanupInterval: number; // milliseconds
  };

  // Webhook Configuration
  webhooks: {
    enabled: boolean;
    port: number;
    host: string;
    basePath: string;
    enableSslVerification: boolean;
    maxPayloadSize: number; // bytes
    timeoutMs: number;
  };

  // Rate Limiting
  rateLimiting: {
    enabled: boolean;
    defaultLimits: {
      requests: number;
      window: number; // milliseconds
    };
    platformLimits: {
      [K in ProjectPlatform]?: {
        requests: number;
        window: number;
      };
    };
  };

  // Security Settings
  security: {
    enableCors: boolean;
    corsOrigins: string[];
    enableHelmet: boolean;
    enableRateLimiting: boolean;
    maxRequestSize: number; // bytes
    trustedProxies: string[];
  };

  // Monitoring and Observability
  monitoring: {
    enableHealthChecks: boolean;
    healthCheckInterval: number; // milliseconds
    enablePerformanceMetrics: boolean;
    enableErrorTracking: boolean;
    errorTrackingDsn?: string;
    enableTracing: boolean;
    tracingEndpoint?: string;
  };

  // Custom Extensions
  extensions: {
    enabled: string[];
    configurations: Record<string, any>;
  };
}

export interface PlatformConfig {
  enabled: boolean;
  priority: number;
  defaultAuth?: string; // Auth config ID
  capabilities?: Partial<PlatformCapabilities>;
  customSettings: Record<string, any>;
  rateLimit?: {
    requests: number;
    window: number;
  };
  timeout?: number;
  retries?: number;
  baseUrl?: string;
}

export interface ConfigValidationResult {
  isValid: boolean;
  errors: ConfigValidationError[];
  warnings: ConfigValidationWarning[];
}

export interface ConfigValidationError {
  path: string;
  message: string;
  value?: any;
  expected?: any;
}

export interface ConfigValidationWarning {
  path: string;
  message: string;
  suggestion?: string;
}

export interface ConfigChange {
  path: string;
  oldValue: any;
  newValue: any;
  timestamp: Date;
  source: 'file' | 'environment' | 'api';
}

export class ConfigManager extends EventEmitter {
  private options: ConfigManagerOptions;
  private config: UnifiedConfig;
  private fileWatcher?: any;
  private configHistory: ConfigChange[] = [];

  constructor(options: Partial<ConfigManagerOptions> = {}) {
    super();
    
    this.options = {
      configDirectory: './config',
      enableFileWatching: true,
      enableEnvironmentOverrides: true,
      enableValidation: true,
      environmentPrefix: 'CLAUDE_FLOW',
      ...options,
    };

    // Initialize with default configuration
    this.config = this.getDefaultConfig();
  }

  // ========================================================================
  // INITIALIZATION AND LOADING
  // ========================================================================

  async initialize(): Promise<void> {
    try {
      await mkdir(this.options.configDirectory, { recursive: true });
      
      // Load configuration from file
      await this.loadConfiguration();

      // Apply environment overrides
      if (this.options.enableEnvironmentOverrides) {
        this.applyEnvironmentOverrides();
      }

      // Validate configuration
      if (this.options.enableValidation) {
        const validation = this.validateConfig();
        if (!validation.isValid) {
          throw new Error(`Configuration validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
        }

        if (validation.warnings.length > 0) {
          this.emit('config:warnings', validation.warnings);
        }
      }

      // Setup file watching
      if (this.options.enableFileWatching) {
        await this.setupFileWatching();
      }

      this.emit('config:initialized', { config: this.config });
    } catch (error) {
      this.emit('config:error', { action: 'initialize', error });
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (this.fileWatcher) {
      await this.fileWatcher.close();
      this.fileWatcher = undefined;
    }

    this.emit('config:shutdown');
  }

  // ========================================================================
  // CONFIGURATION ACCESS
  // ========================================================================

  getConfig(): UnifiedConfig {
    return { ...this.config };
  }

  getConfigValue<T = any>(path: string): T {
    return this.getNestedValue(this.config, path) as T;
  }

  getPlatformConfig(platform: ProjectPlatform): PlatformConfig | null {
    return this.config.platforms[platform] || null;
  }

  getAuthConfig(): UnifiedConfig['authentication'] {
    return { ...this.config.authentication };
  }

  getEventConfig(): UnifiedConfig['events'] {
    return { ...this.config.events };
  }

  getCacheConfig(): UnifiedConfig['cache'] {
    return { ...this.config.cache };
  }

  getWebhookConfig(): UnifiedConfig['webhooks'] {
    return { ...this.config.webhooks };
  }

  getSecurityConfig(): UnifiedConfig['security'] {
    return { ...this.config.security };
  }

  // ========================================================================
  // CONFIGURATION UPDATES
  // ========================================================================

  async updateConfig(updates: Partial<UnifiedConfig>, source: 'file' | 'environment' | 'api' = 'api'): Promise<void> {
    const oldConfig = { ...this.config };
    
    try {
      // Apply updates
      this.config = this.mergeDeep(this.config, updates);

      // Validate if enabled
      if (this.options.enableValidation) {
        const validation = this.validateConfig();
        if (!validation.isValid) {
          // Rollback on validation failure
          this.config = oldConfig;
          throw new Error(`Configuration validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
        }
      }

      // Record changes
      this.recordConfigChanges(oldConfig, this.config, source);

      // Save to file if source is API
      if (source === 'api') {
        await this.saveConfiguration();
      }

      this.emit('config:updated', {
        oldConfig: oldConfig,
        newConfig: this.config,
        source,
      });
    } catch (error) {
      this.emit('config:error', { action: 'update', error });
      throw error;
    }
  }

  async updateConfigValue(path: string, value: any, source: 'file' | 'environment' | 'api' = 'api'): Promise<void> {
    const oldValue = this.getNestedValue(this.config, path);
    
    try {
      this.setNestedValue(this.config, path, value);

      // Validate if enabled
      if (this.options.enableValidation) {
        const validation = this.validateConfig();
        if (!validation.isValid) {
          // Rollback on validation failure
          this.setNestedValue(this.config, path, oldValue);
          throw new Error(`Configuration validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
        }
      }

      // Record change
      this.configHistory.push({
        path,
        oldValue,
        newValue: value,
        timestamp: new Date(),
        source,
      });

      // Save to file if source is API
      if (source === 'api') {
        await this.saveConfiguration();
      }

      this.emit('config:value_updated', { path, oldValue, newValue: value, source });
    } catch (error) {
      this.emit('config:error', { action: 'updateValue', error });
      throw error;
    }
  }

  async updatePlatformConfig(platform: ProjectPlatform, config: Partial<PlatformConfig>): Promise<void> {
    const currentConfig = this.config.platforms[platform] || {};
    const updatedConfig = { ...currentConfig, ...config };
    
    await this.updateConfigValue(`platforms.${platform}`, updatedConfig);
  }

  // ========================================================================
  // VALIDATION
  // ========================================================================

  validateConfig(config: UnifiedConfig = this.config): ConfigValidationResult {
    const errors: ConfigValidationError[] = [];
    const warnings: ConfigValidationWarning[] = [];

    try {
      // Validate core configuration
      this.validateCoreConfig(config.core, errors, warnings);

      // Validate platform configurations
      this.validatePlatformConfigs(config.platforms, errors, warnings);

      // Validate authentication configuration
      this.validateAuthConfig(config.authentication, errors, warnings);

      // Validate event configuration
      this.validateEventConfig(config.events, errors, warnings);

      // Validate cache configuration
      this.validateCacheConfig(config.cache, errors, warnings);

      // Validate webhook configuration
      this.validateWebhookConfig(config.webhooks, errors, warnings);

      // Validate security configuration
      this.validateSecurityConfig(config.security, errors, warnings);

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      errors.push({
        path: 'root',
        message: error instanceof Error ? error.message : 'Unknown validation error',
      });

      return { isValid: false, errors, warnings };
    }
  }

  // ========================================================================
  // CONFIGURATION HISTORY AND ROLLBACK
  // ========================================================================

  getConfigHistory(limit: number = 50): ConfigChange[] {
    return this.configHistory.slice(-limit);
  }

  async rollbackConfig(steps: number = 1): Promise<void> {
    if (this.configHistory.length < steps) {
      throw new Error(`Cannot rollback ${steps} steps, only ${this.configHistory.length} changes available`);
    }

    // This is a simplified rollback - in practice, you'd need more sophisticated logic
    const targetChange = this.configHistory[this.configHistory.length - steps];
    
    await this.updateConfigValue(targetChange.path, targetChange.oldValue, 'api');
    
    this.emit('config:rolled_back', { steps, targetChange });
  }

  // ========================================================================
  // ENVIRONMENT HANDLING
  // ========================================================================

  private applyEnvironmentOverrides(): void {
    const prefix = this.options.environmentPrefix;
    
    // Apply environment variable overrides
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(`${prefix}_`)) {
        const configPath = key
          .substring(prefix.length + 1)
          .toLowerCase()
          .replace(/_/g, '.');

        const parsedValue = this.parseEnvironmentValue(value);
        this.setNestedValue(this.config, configPath, parsedValue);

        this.configHistory.push({
          path: configPath,
          oldValue: this.getNestedValue(this.config, configPath),
          newValue: parsedValue,
          timestamp: new Date(),
          source: 'environment',
        });
      }
    }
  }

  private parseEnvironmentValue(value: string | undefined): any {
    if (!value) return undefined;

    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch {
      // If not JSON, parse as primitive types
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
      if (/^\d+$/.test(value)) return parseInt(value, 10);
      if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
      return value;
    }
  }

  // ========================================================================
  // FILE OPERATIONS
  // ========================================================================

  private async loadConfiguration(): Promise<void> {
    const configFile = this.options.defaultConfigFile || 'config.yaml';
    const configPath = join(this.options.configDirectory, configFile);

    try {
      const content = await readFile(configPath, 'utf-8');
      let loadedConfig: Partial<UnifiedConfig>;

      if (configPath.endsWith('.json')) {
        loadedConfig = JSON.parse(content);
      } else if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
        loadedConfig = yaml.parse(content);
      } else {
        throw new Error(`Unsupported configuration file format: ${configPath}`);
      }

      // Merge with default configuration
      this.config = this.mergeDeep(this.getDefaultConfig(), loadedConfig);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        // Configuration file doesn't exist, create it with defaults
        await this.saveConfiguration();
      } else {
        throw error;
      }
    }
  }

  private async saveConfiguration(): Promise<void> {
    const configFile = this.options.defaultConfigFile || 'config.yaml';
    const configPath = join(this.options.configDirectory, configFile);

    let content: string;

    if (configPath.endsWith('.json')) {
      content = JSON.stringify(this.config, null, 2);
    } else {
      content = yaml.stringify(this.config);
    }

    await writeFile(configPath, content, 'utf-8');
    this.emit('config:saved', { path: configPath });
  }

  private async setupFileWatching(): Promise<void> {
    const configFile = this.options.defaultConfigFile || 'config.yaml';
    const configPath = join(this.options.configDirectory, configFile);

    try {
      this.fileWatcher = watch(configPath, async (eventType) => {
        if (eventType === 'change') {
          try {
            await this.loadConfiguration();
            
            if (this.options.enableEnvironmentOverrides) {
              this.applyEnvironmentOverrides();
            }

            this.emit('config:file_changed', { path: configPath });
          } catch (error) {
            this.emit('config:error', { action: 'file_watch', error });
          }
        }
      });
    } catch (error) {
      // File watching is optional, so just emit a warning
      this.emit('config:warning', { message: 'File watching setup failed', error });
    }
  }

  // ========================================================================
  // VALIDATION HELPERS
  // ========================================================================

  private validateCoreConfig(core: UnifiedConfig['core'], errors: ConfigValidationError[], warnings: ConfigValidationWarning[]): void {
    if (!['debug', 'info', 'warn', 'error'].includes(core.logLevel)) {
      errors.push({
        path: 'core.logLevel',
        message: 'Invalid log level',
        value: core.logLevel,
        expected: ['debug', 'info', 'warn', 'error'],
      });
    }

    if (core.maxConcurrentOperations <= 0) {
      errors.push({
        path: 'core.maxConcurrentOperations',
        message: 'Must be greater than 0',
        value: core.maxConcurrentOperations,
      });
    }

    if (core.operationTimeout <= 0) {
      errors.push({
        path: 'core.operationTimeout',
        message: 'Must be greater than 0',
        value: core.operationTimeout,
      });
    }

    if (core.maxConcurrentOperations > 100) {
      warnings.push({
        path: 'core.maxConcurrentOperations',
        message: 'High concurrency may impact performance',
        suggestion: 'Consider reducing to 50 or less',
      });
    }
  }

  private validatePlatformConfigs(platforms: UnifiedConfig['platforms'], errors: ConfigValidationError[], warnings: ConfigValidationWarning[]): void {
    for (const [platform, config] of Object.entries(platforms)) {
      if (!config) continue;

      if (config.priority < 0) {
        errors.push({
          path: `platforms.${platform}.priority`,
          message: 'Priority must be non-negative',
          value: config.priority,
        });
      }

      if (config.timeout && config.timeout <= 0) {
        errors.push({
          path: `platforms.${platform}.timeout`,
          message: 'Timeout must be greater than 0',
          value: config.timeout,
        });
      }
    }
  }

  private validateAuthConfig(auth: UnifiedConfig['authentication'], errors: ConfigValidationError[], warnings: ConfigValidationWarning[]): void {
    if (auth.tokenRefreshBuffer < 0) {
      errors.push({
        path: 'authentication.tokenRefreshBuffer',
        message: 'Token refresh buffer must be non-negative',
        value: auth.tokenRefreshBuffer,
      });
    }

    if (auth.maxRetryAttempts < 0) {
      errors.push({
        path: 'authentication.maxRetryAttempts',
        message: 'Max retry attempts must be non-negative',
        value: auth.maxRetryAttempts,
      });
    }

    if (auth.encryptionEnabled && !auth.encryptionKey) {
      warnings.push({
        path: 'authentication.encryptionKey',
        message: 'Encryption is enabled but no key is provided',
        suggestion: 'Provide an encryption key or disable encryption',
      });
    }
  }

  private validateEventConfig(events: UnifiedConfig['events'], errors: ConfigValidationError[], warnings: ConfigValidationWarning[]): void {
    if (events.bufferSize <= 0) {
      errors.push({
        path: 'events.bufferSize',
        message: 'Buffer size must be greater than 0',
        value: events.bufferSize,
      });
    }

    if (events.bufferFlushInterval <= 0) {
      errors.push({
        path: 'events.bufferFlushInterval',
        message: 'Buffer flush interval must be greater than 0',
        value: events.bufferFlushInterval,
      });
    }
  }

  private validateCacheConfig(cache: UnifiedConfig['cache'], errors: ConfigValidationError[], warnings: ConfigValidationWarning[]): void {
    if (cache.ttl <= 0) {
      errors.push({
        path: 'cache.ttl',
        message: 'TTL must be greater than 0',
        value: cache.ttl,
      });
    }

    if (cache.maxSize <= 0) {
      errors.push({
        path: 'cache.maxSize',
        message: 'Max size must be greater than 0',
        value: cache.maxSize,
      });
    }
  }

  private validateWebhookConfig(webhooks: UnifiedConfig['webhooks'], errors: ConfigValidationError[], warnings: ConfigValidationWarning[]): void {
    if (webhooks.port < 1 || webhooks.port > 65535) {
      errors.push({
        path: 'webhooks.port',
        message: 'Port must be between 1 and 65535',
        value: webhooks.port,
      });
    }

    if (webhooks.maxPayloadSize <= 0) {
      errors.push({
        path: 'webhooks.maxPayloadSize',
        message: 'Max payload size must be greater than 0',
        value: webhooks.maxPayloadSize,
      });
    }
  }

  private validateSecurityConfig(security: UnifiedConfig['security'], errors: ConfigValidationError[], warnings: ConfigValidationWarning[]): void {
    if (security.maxRequestSize <= 0) {
      errors.push({
        path: 'security.maxRequestSize',
        message: 'Max request size must be greater than 0',
        value: security.maxRequestSize,
      });
    }

    if (security.corsOrigins.some(origin => origin === '*')) {
      warnings.push({
        path: 'security.corsOrigins',
        message: 'Wildcard CORS origin detected',
        suggestion: 'Consider specifying explicit origins for better security',
      });
    }
  }

  // ========================================================================
  // UTILITY METHODS
  // ========================================================================

  private getDefaultConfig(): UnifiedConfig {
    return {
      version: '1.0.0',
      environment: 'development',
      core: {
        logLevel: 'info',
        enableMetrics: true,
        enableTelemetry: false,
        maxConcurrentOperations: 10,
        operationTimeout: 30000,
        retryAttempts: 3,
        retryBackoff: 1000,
      },
      platforms: {},
      authentication: {
        storageDirectory: './auth',
        encryptionEnabled: false,
        tokenRefreshBuffer: 30,
        maxRetryAttempts: 3,
        enableAutoRefresh: true,
      },
      events: {
        enableEventBuffering: true,
        bufferSize: 100,
        bufferFlushInterval: 5000,
        enableEventPersistence: false,
        maxRetryAttempts: 3,
        defaultRetryBackoff: 1000,
        enableEventTransformation: true,
        enableEventFiltering: true,
      },
      cache: {
        enabled: true,
        ttl: 300000, // 5 minutes
        maxSize: 1000,
        enablePersistence: false,
        cleanupInterval: 60000, // 1 minute
      },
      webhooks: {
        enabled: false,
        port: 3001,
        host: '0.0.0.0',
        basePath: '/webhooks',
        enableSslVerification: true,
        maxPayloadSize: 1048576, // 1MB
        timeoutMs: 30000,
      },
      rateLimiting: {
        enabled: true,
        defaultLimits: {
          requests: 100,
          window: 60000, // 1 minute
        },
        platformLimits: {},
      },
      security: {
        enableCors: true,
        corsOrigins: ['http://localhost:3000'],
        enableHelmet: true,
        enableRateLimiting: true,
        maxRequestSize: 10485760, // 10MB
        trustedProxies: [],
      },
      monitoring: {
        enableHealthChecks: true,
        healthCheckInterval: 30000,
        enablePerformanceMetrics: true,
        enableErrorTracking: false,
        enableTracing: false,
      },
      extensions: {
        enabled: [],
        configurations: {},
      },
    };
  }

  private mergeDeep(target: any, source: any): any {
    const output = { ...target };
    
    if (this.isObject(target) && this.isObject(source)) {
      for (const key of Object.keys(source)) {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            output[key] = source[key];
          } else {
            output[key] = this.mergeDeep(target[key], source[key]);
          }
        } else {
          output[key] = source[key];
        }
      }
    }
    
    return output;
  }

  private isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    
    const target = keys.reduce((current, key) => {
      if (!(key in current)) {
        current[key] = {};
      }
      return current[key];
    }, obj);
    
    target[lastKey] = value;
  }

  private recordConfigChanges(oldConfig: UnifiedConfig, newConfig: UnifiedConfig, source: 'file' | 'environment' | 'api'): void {
    // This is a simplified implementation - in practice, you'd do a deep diff
    const changes = this.deepDiff(oldConfig, newConfig);
    
    for (const change of changes) {
      this.configHistory.push({
        ...change,
        timestamp: new Date(),
        source,
      });
    }
  }

  private deepDiff(obj1: any, obj2: any, path: string = ''): ConfigChange[] {
    const changes: ConfigChange[] = [];
    
    // This is a simplified diff implementation
    if (JSON.stringify(obj1) !== JSON.stringify(obj2)) {
      changes.push({
        path,
        oldValue: obj1,
        newValue: obj2,
        timestamp: new Date(),
        source: 'api',
      });
    }
    
    return changes;
  }
}