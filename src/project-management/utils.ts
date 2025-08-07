/**
 * Utility functions for the unified project management system
 */

import type {
  ProjectPlatform,
  PlatformAdapter,
  AuthConfig,
  AuthType,
  UnifiedConfig,
  PlatformConfig,
  PlatformCapabilities,
} from './core/interfaces.js';

import { UnifiedProjectManager, type UnifiedProjectManagerConfig } from './core/unified-project-manager.js';
import { GitHubAdapter } from './adapters/github-adapter.js';
import { JiraAdapter } from './adapters/jira-adapter.js';
import { AuthManager } from './auth/auth-manager.js';
import { EventManager } from './events/event-manager.js';
import { ConfigManager } from './config/config-manager.js';
import { PluginManager } from './plugins/plugin-manager.js';

/**
 * Create a fully configured unified project manager with sensible defaults
 */
export async function createUnifiedProjectManager(
  config?: Partial<UnifiedProjectManagerConfig>
): Promise<UnifiedProjectManager> {
  const defaultConfig: UnifiedProjectManagerConfig = {
    defaultPlatform: undefined,
    enableEventAggregation: true,
    enableCaching: true,
    cacheConfig: {
      ttl: 5 * 60 * 1000, // 5 minutes
      maxSize: 1000,
      enablePersistence: false,
    },
    retryConfig: {
      maxRetries: 3,
      backoffMultiplier: 2,
      maxBackoffTime: 30000,
    },
    logging: {
      enabled: true,
      level: 'info',
    },
  };

  const manager = new UnifiedProjectManager({ ...defaultConfig, ...config });
  return manager;
}

/**
 * Create default configuration for the unified project management system
 */
export function createDefaultConfiguration(): UnifiedConfig {
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
    platforms: {
      github: {
        enabled: false,
        priority: 10,
        customSettings: {},
        rateLimit: {
          requests: 5000,
          window: 3600000, // 1 hour
        },
        timeout: 30000,
        retries: 3,
      },
      jira: {
        enabled: false,
        priority: 10,
        customSettings: {},
        rateLimit: {
          requests: 1000,
          window: 3600000, // 1 hour
        },
        timeout: 30000,
        retries: 3,
      },
    },
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
      platformLimits: {
        github: {
          requests: 5000,
          window: 3600000, // 1 hour
        },
        jira: {
          requests: 1000,
          window: 3600000, // 1 hour
        },
      },
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

/**
 * Validate if a platform is supported by the system
 */
export function validatePlatformSupport(platform: ProjectPlatform): boolean {
  const supportedPlatforms: ProjectPlatform[] = ['github', 'jira', 'azure-devops', 'linear', 'asana'];
  return supportedPlatforms.includes(platform);
}

/**
 * Get platform capabilities for a given platform
 */
export function getPlatformCapabilities(platform: ProjectPlatform): PlatformCapabilities | null {
  switch (platform) {
    case 'github':
      return new GitHubAdapter().capabilities;
    case 'jira':
      return new JiraAdapter().capabilities;
    // Add other platforms as they're implemented
    default:
      return null;
  }
}

/**
 * Create a platform adapter instance for the given platform
 */
export function createPlatformAdapter(platform: ProjectPlatform): PlatformAdapter | null {
  switch (platform) {
    case 'github':
      return new GitHubAdapter();
    case 'jira':
      return new JiraAdapter();
    // Add other platforms as they're implemented
    default:
      return null;
  }
}

/**
 * Create an authentication configuration with validation
 */
export function createAuthConfig(config: {
  platform: ProjectPlatform;
  type: AuthType;
  baseUrl?: string;
  credentials: {
    token?: string;
    username?: string;
    password?: string;
    clientId?: string;
    clientSecret?: string;
    privateKey?: string;
    certificate?: string;
    [key: string]: any;
  };
  scopes?: string[];
  refreshConfig?: {
    enabled: boolean;
    endpoint?: string;
    refreshToken?: string;
    expirationBuffer?: number;
  };
}): AuthConfig {
  // Validate required fields based on auth type
  validateAuthConfigFields(config);

  return {
    platform: config.platform,
    type: config.type,
    baseUrl: config.baseUrl,
    credentials: config.credentials,
    scopes: config.scopes,
    refreshConfig: config.refreshConfig,
  };
}

/**
 * Validate authentication configuration fields
 */
function validateAuthConfigFields(config: any): void {
  if (!config.platform) {
    throw new Error('Platform is required for auth configuration');
  }

  if (!config.type) {
    throw new Error('Auth type is required for auth configuration');
  }

  if (!config.credentials) {
    throw new Error('Credentials are required for auth configuration');
  }

  switch (config.type) {
    case 'token':
      if (!config.credentials.token) {
        throw new Error('Token is required for token authentication');
      }
      break;

    case 'oauth':
      if (!config.credentials.clientId || !config.credentials.clientSecret) {
        throw new Error('Client ID and secret are required for OAuth authentication');
      }
      break;

    case 'basic':
      if (!config.credentials.username || !config.credentials.password) {
        throw new Error('Username and password are required for basic authentication');
      }
      break;

    case 'app':
      if (!config.credentials.clientId || !config.credentials.privateKey) {
        throw new Error('Client ID and private key are required for app authentication');
      }
      break;

    case 'certificate':
      if (!config.credentials.certificate || !config.credentials.privateKey) {
        throw new Error('Certificate and private key are required for certificate authentication');
      }
      break;
  }
}

/**
 * Create a complete project management system with all components
 */
export async function createCompleteSystem(config?: {
  configDirectory?: string;
  authDirectory?: string;
  pluginDirectories?: string[];
  dataDirectory?: string;
  enableHotReload?: boolean;
}): Promise<{
  projectManager: UnifiedProjectManager;
  authManager: AuthManager;
  eventManager: EventManager;
  configManager: ConfigManager;
  pluginManager: PluginManager;
}> {
  // Initialize configuration manager
  const configManager = new ConfigManager({
    configDirectory: config?.configDirectory || './config',
    enableFileWatching: true,
    enableEnvironmentOverrides: true,
    enableValidation: true,
  });
  await configManager.initialize();

  // Initialize authentication manager
  const authManager = new AuthManager({
    storageDirectory: config?.authDirectory || './auth',
    encryptionEnabled: false,
    defaultTokenRefreshBuffer: 30,
    maxRetryAttempts: 3,
    enableAutoRefresh: true,
  });
  await authManager.initialize();

  // Initialize event manager
  const eventManager = new EventManager({
    enableEventBuffering: true,
    bufferSize: 100,
    bufferFlushInterval: 5000,
    enableEventPersistence: false,
    maxRetryAttempts: 3,
    defaultRetryBackoff: 1000,
  });
  await eventManager.initialize();

  // Initialize plugin manager
  const pluginManager = new PluginManager({
    pluginDirectories: config?.pluginDirectories || ['./plugins'],
    enableHotReload: config?.enableHotReload || false,
    enableSandboxing: true,
    maxPlugins: 50,
    pluginTimeout: 30000,
    dataDirectory: config?.dataDirectory || './plugin-data',
  });
  await pluginManager.initialize();

  // Initialize unified project manager
  const projectManager = await createUnifiedProjectManager({
    enableEventAggregation: true,
    enableCaching: true,
  });

  return {
    projectManager,
    authManager,
    eventManager,
    configManager,
    pluginManager,
  };
}

/**
 * Helper function to set up GitHub integration
 */
export async function setupGitHubIntegration(
  projectManager: UnifiedProjectManager,
  config: {
    token: string;
    baseUrl?: string;
    owner?: string;
    repo?: string;
    isDefault?: boolean;
  }
): Promise<void> {
  const githubAdapter = new GitHubAdapter();
  
  await projectManager.registerAdapter({
    adapter: githubAdapter,
    config: {
      platform: 'github',
      type: 'token',
      baseUrl: config.baseUrl,
      credentials: {
        token: config.token,
        customFields: {
          owner: config.owner,
          repo: config.repo,
        },
      },
    },
    isDefault: config.isDefault || false,
    isEnabled: true,
    priority: 10,
  });
}

/**
 * Helper function to set up Jira integration
 */
export async function setupJiraIntegration(
  projectManager: UnifiedProjectManager,
  config: {
    baseUrl: string;
    username: string;
    token: string;
    isDefault?: boolean;
  }
): Promise<void> {
  const jiraAdapter = new JiraAdapter();
  
  await projectManager.registerAdapter({
    adapter: jiraAdapter,
    config: {
      platform: 'jira',
      type: 'basic',
      baseUrl: config.baseUrl,
      credentials: {
        username: config.username,
        token: config.token,
      },
    },
    isDefault: config.isDefault || false,
    isEnabled: true,
    priority: 10,
  });
}

/**
 * Utility to merge platform configurations with defaults
 */
export function mergePlatformConfig(
  defaultConfig: PlatformConfig,
  userConfig: Partial<PlatformConfig>
): PlatformConfig {
  return {
    enabled: userConfig.enabled ?? defaultConfig.enabled,
    priority: userConfig.priority ?? defaultConfig.priority,
    defaultAuth: userConfig.defaultAuth ?? defaultConfig.defaultAuth,
    capabilities: userConfig.capabilities ? 
      { ...defaultConfig.capabilities, ...userConfig.capabilities } : 
      defaultConfig.capabilities,
    customSettings: { ...defaultConfig.customSettings, ...userConfig.customSettings },
    rateLimit: userConfig.rateLimit ?? defaultConfig.rateLimit,
    timeout: userConfig.timeout ?? defaultConfig.timeout,
    retries: userConfig.retries ?? defaultConfig.retries,
    baseUrl: userConfig.baseUrl ?? defaultConfig.baseUrl,
  };
}

/**
 * Generate a unique operation ID for tracking
 */
export function generateOperationId(): string {
  return `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Format platform error for consistent error handling
 */
export function formatPlatformError(
  platform: ProjectPlatform,
  operation: string,
  error: any
): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`[${platform}] ${operation} failed: ${message}`);
}

/**
 * Check if an operation result indicates success
 */
export function isOperationSuccessful(result: any): boolean {
  return result && typeof result === 'object' && result.success === true;
}

/**
 * Extract error message from various error formats
 */
export function extractErrorMessage(error: any): string {
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  if (error && typeof error === 'object') {
    return error.message || error.error || error.details || JSON.stringify(error);
  }
  
  return 'Unknown error';
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize configuration for logging (remove sensitive data)
 */
export function sanitizeConfigForLogging(config: any): any {
  const sensitiveFields = ['token', 'password', 'secret', 'key', 'privateKey', 'certificate'];
  
  const sanitized = JSON.parse(JSON.stringify(config));
  
  function sanitizeObject(obj: any, path: string = ''): void {
    if (typeof obj !== 'object' || obj === null) {
      return;
    }
    
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        obj[key] = '***REDACTED***';
      } else if (typeof value === 'object') {
        sanitizeObject(value, currentPath);
      }
    }
  }
  
  sanitizeObject(sanitized);
  return sanitized;
}