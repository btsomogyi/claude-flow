/**
 * Constants for the unified project management system
 */

import type {
  ProjectPlatform,
  EventType,
  ProjectStatus,
  IssueType,
  Priority,
  BoardType,
  AuthType,
} from './core/interfaces.js';
import type { PluginType } from './plugins/plugin-manager.js';

/**
 * Supported project management platforms
 */
export const SUPPORTED_PLATFORMS: ProjectPlatform[] = [
  'github',
  'jira',
  'azure-devops',
  'linear',
  'asana',
  'custom',
];

/**
 * Default timeout values for different operations (in milliseconds)
 */
export const DEFAULT_TIMEOUTS = {
  CONNECTION: 30000, // 30 seconds
  AUTHENTICATION: 15000, // 15 seconds
  API_CALL: 30000, // 30 seconds
  BULK_OPERATION: 120000, // 2 minutes
  FILE_UPLOAD: 300000, // 5 minutes
  WEBHOOK_RESPONSE: 5000, // 5 seconds
  PLUGIN_OPERATION: 30000, // 30 seconds
  CACHE_TTL: 300000, // 5 minutes
  EVENT_PROCESSING: 10000, // 10 seconds
} as const;

/**
 * Default rate limits for different platforms
 */
export const DEFAULT_RATE_LIMITS = {
  github: {
    requests: 5000,
    window: 3600000, // 1 hour
    burstLimit: 100,
  },
  jira: {
    requests: 1000,
    window: 3600000, // 1 hour
    burstLimit: 50,
  },
  'azure-devops': {
    requests: 2000,
    window: 3600000, // 1 hour
    burstLimit: 75,
  },
  linear: {
    requests: 1800,
    window: 3600000, // 1 hour
    burstLimit: 60,
  },
  asana: {
    requests: 1500,
    window: 3600000, // 1 hour
    burstLimit: 50,
  },
  custom: {
    requests: 1000,
    window: 3600000, // 1 hour
    burstLimit: 30,
  },
} as const;

/**
 * All supported event types in the system
 */
export const EVENT_TYPES: EventType[] = [
  // Project events
  'project.created',
  'project.updated',
  'project.deleted',

  // Issue events
  'issue.created',
  'issue.updated',
  'issue.deleted',
  'issue.transitioned',

  // Comment events
  'comment.created',
  'comment.updated',
  'comment.deleted',

  // Attachment events
  'attachment.added',
  'attachment.removed',

  // Member events
  'member.added',
  'member.removed',
  'member.role_changed',

  // Workflow events
  'workflow.updated',

  // Board events
  'board.updated',

  // Custom events
  'custom',
] as const;

/**
 * Plugin types supported by the system
 */
export const PLUGIN_TYPES: PluginType[] = [
  'adapter',
  'transformer',
  'handler',
  'ui',
  'integration',
  'utility',
  'workflow',
  'notification',
  'storage',
  'auth',
  'custom',
] as const;

/**
 * Project status values
 */
export const PROJECT_STATUSES: ProjectStatus[] = [
  'planning',
  'active',
  'on_hold',
  'completed',
  'cancelled',
  'archived',
  'todo',
  'in_progress',
  'review',
  'testing',
  'done',
  'blocked',
  'open',
  'closed',
  'resolved',
  'reopened',
] as const;

/**
 * Issue type values
 */
export const ISSUE_TYPES: IssueType[] = [
  'task',
  'bug',
  'feature',
  'epic',
  'story',
  'subtask',
  'improvement',
  'research',
  'spike',
  'test',
  'documentation',
] as const;

/**
 * Priority levels
 */
export const PRIORITIES: Priority[] = [
  'lowest',
  'low',
  'medium',
  'high',
  'highest',
  'critical',
] as const;

/**
 * Board types
 */
export const BOARD_TYPES: BoardType[] = [
  'kanban',
  'scrum',
  'list',
  'calendar',
  'roadmap',
  'custom',
] as const;

/**
 * Authentication types
 */
export const AUTH_TYPES: AuthType[] = [
  'token',
  'oauth',
  'basic',
  'app',
  'certificate',
  'custom',
] as const;

/**
 * HTTP status codes commonly used in platform APIs
 */
export const HTTP_STATUS_CODES = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

/**
 * Default configuration values for different components
 */
export const DEFAULT_CONFIG = {
  CACHE: {
    TTL: 300000, // 5 minutes
    MAX_SIZE: 1000,
    CLEANUP_INTERVAL: 60000, // 1 minute
  },
  
  EVENTS: {
    BUFFER_SIZE: 100,
    FLUSH_INTERVAL: 5000, // 5 seconds
    MAX_RETRY_ATTEMPTS: 3,
    RETRY_BACKOFF: 1000, // 1 second
  },
  
  PLUGINS: {
    MAX_PLUGINS: 50,
    PLUGIN_TIMEOUT: 30000, // 30 seconds
    SANDBOX_ENABLED: true,
  },
  
  WEBHOOKS: {
    PORT: 3001,
    HOST: '0.0.0.0',
    BASE_PATH: '/webhooks',
    MAX_PAYLOAD_SIZE: 1048576, // 1MB
    TIMEOUT: 30000, // 30 seconds
  },
  
  SECURITY: {
    MAX_REQUEST_SIZE: 10485760, // 10MB
    CORS_ORIGINS: ['http://localhost:3000'],
    RATE_LIMIT_WINDOW: 60000, // 1 minute
    RATE_LIMIT_REQUESTS: 100,
  },
} as const;

/**
 * API version information
 */
export const API_VERSIONS = {
  UNIFIED_API: '1.0.0',
  GITHUB_API: 'v4', // GraphQL
  JIRA_API: '3',
  AZURE_DEVOPS_API: '7.0',
  LINEAR_API: '1.0',
  ASANA_API: '1.0',
} as const;

/**
 * Platform-specific configuration templates
 */
export const PLATFORM_CONFIG_TEMPLATES = {
  github: {
    enabled: true,
    priority: 10,
    customSettings: {
      useGraphQL: true,
      includeArchivedRepos: false,
      maxItemsPerPage: 100,
    },
    rateLimit: DEFAULT_RATE_LIMITS.github,
    timeout: DEFAULT_TIMEOUTS.API_CALL,
    retries: 3,
  },
  
  jira: {
    enabled: true,
    priority: 10,
    customSettings: {
      useCloudApi: true,
      enableJQL: true,
      maxItemsPerPage: 50,
      includeSubtasks: true,
    },
    rateLimit: DEFAULT_RATE_LIMITS.jira,
    timeout: DEFAULT_TIMEOUTS.API_CALL,
    retries: 3,
  },
  
  'azure-devops': {
    enabled: true,
    priority: 10,
    customSettings: {
      organization: '',
      project: '',
      maxItemsPerPage: 100,
    },
    rateLimit: DEFAULT_RATE_LIMITS['azure-devops'],
    timeout: DEFAULT_TIMEOUTS.API_CALL,
    retries: 3,
  },
  
  linear: {
    enabled: true,
    priority: 10,
    customSettings: {
      useGraphQL: true,
      maxItemsPerPage: 50,
    },
    rateLimit: DEFAULT_RATE_LIMITS.linear,
    timeout: DEFAULT_TIMEOUTS.API_CALL,
    retries: 3,
  },
  
  asana: {
    enabled: true,
    priority: 10,
    customSettings: {
      maxItemsPerPage: 100,
      includeArchived: false,
    },
    rateLimit: DEFAULT_RATE_LIMITS.asana,
    timeout: DEFAULT_TIMEOUTS.API_CALL,
    retries: 3,
  },
} as const;

/**
 * Webhook event mapping between platforms and unified events
 */
export const WEBHOOK_EVENT_MAPPING = {
  github: {
    'issues.opened': 'issue.created',
    'issues.edited': 'issue.updated',
    'issues.closed': 'issue.updated',
    'issues.reopened': 'issue.updated',
    'issue_comment.created': 'comment.created',
    'issue_comment.edited': 'comment.updated',
    'issue_comment.deleted': 'comment.deleted',
    'project.created': 'project.created',
    'project.edited': 'project.updated',
    'project.deleted': 'project.deleted',
  },
  
  jira: {
    'jira:issue_created': 'issue.created',
    'jira:issue_updated': 'issue.updated',
    'jira:issue_deleted': 'issue.deleted',
    'comment_created': 'comment.created',
    'comment_updated': 'comment.updated',
    'comment_deleted': 'comment.deleted',
    'project_created': 'project.created',
    'project_updated': 'project.updated',
    'project_deleted': 'project.deleted',
    'worklog_updated': 'issue.updated',
  },
} as const;

/**
 * Field mapping between platforms and unified model
 */
export const FIELD_MAPPING = {
  github: {
    id: 'number',
    title: 'title',
    description: 'body',
    status: 'state',
    assignee: 'assignees[0].login',
    labels: 'labels[].name',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    url: 'html_url',
  },
  
  jira: {
    id: 'key',
    title: 'fields.summary',
    description: 'fields.description',
    status: 'fields.status.name',
    assignee: 'fields.assignee.accountId',
    labels: 'fields.labels',
    createdAt: 'fields.created',
    updatedAt: 'fields.updated',
    url: 'self',
  },
} as const;

/**
 * Error codes and messages
 */
export const ERROR_CODES = {
  // Authentication errors
  AUTH_INVALID_CREDENTIALS: 'AUTH_001',
  AUTH_EXPIRED_TOKEN: 'AUTH_002',
  AUTH_INSUFFICIENT_PERMISSIONS: 'AUTH_003',
  AUTH_RATE_LIMITED: 'AUTH_004',
  
  // Platform errors
  PLATFORM_NOT_SUPPORTED: 'PLATFORM_001',
  PLATFORM_CONNECTION_FAILED: 'PLATFORM_002',
  PLATFORM_API_ERROR: 'PLATFORM_003',
  PLATFORM_TIMEOUT: 'PLATFORM_004',
  
  // Configuration errors
  CONFIG_INVALID: 'CONFIG_001',
  CONFIG_MISSING_REQUIRED: 'CONFIG_002',
  CONFIG_VALIDATION_FAILED: 'CONFIG_003',
  
  // Plugin errors
  PLUGIN_NOT_FOUND: 'PLUGIN_001',
  PLUGIN_LOAD_FAILED: 'PLUGIN_002',
  PLUGIN_EXECUTION_FAILED: 'PLUGIN_003',
  PLUGIN_TIMEOUT: 'PLUGIN_004',
  
  // Event errors
  EVENT_PROCESSING_FAILED: 'EVENT_001',
  EVENT_HANDLER_ERROR: 'EVENT_002',
  WEBHOOK_VERIFICATION_FAILED: 'EVENT_003',
  
  // Operation errors
  OPERATION_NOT_SUPPORTED: 'OP_001',
  OPERATION_FAILED: 'OP_002',
  OPERATION_TIMEOUT: 'OP_003',
  OPERATION_RATE_LIMITED: 'OP_004',
} as const;

/**
 * Default retry configurations for different operation types
 */
export const RETRY_CONFIGS = {
  AUTHENTICATION: {
    maxRetries: 3,
    backoffMultiplier: 2,
    maxBackoffTime: 30000,
    retryableStatusCodes: [429, 500, 502, 503, 504],
  },
  
  API_CALL: {
    maxRetries: 3,
    backoffMultiplier: 2,
    maxBackoffTime: 60000,
    retryableStatusCodes: [429, 500, 502, 503, 504],
  },
  
  WEBHOOK: {
    maxRetries: 5,
    backoffMultiplier: 2,
    maxBackoffTime: 300000, // 5 minutes
    retryableStatusCodes: [429, 500, 502, 503, 504],
  },
  
  EVENT_PROCESSING: {
    maxRetries: 3,
    backoffMultiplier: 1.5,
    maxBackoffTime: 30000,
    retryableErrors: ['timeout', 'network', 'temporary'],
  },
} as const;

/**
 * Logging levels and categories
 */
export const LOGGING = {
  LEVELS: ['debug', 'info', 'warn', 'error'] as const,
  
  CATEGORIES: [
    'authentication',
    'platform',
    'event',
    'plugin',
    'config',
    'cache',
    'webhook',
    'security',
    'performance',
  ] as const,
} as const;

/**
 * Performance monitoring metrics
 */
export const METRICS = {
  OPERATION_DURATION: 'operation_duration_ms',
  API_CALL_DURATION: 'api_call_duration_ms',
  CACHE_HIT_RATE: 'cache_hit_rate',
  EVENT_PROCESSING_RATE: 'event_processing_rate',
  PLUGIN_EXECUTION_TIME: 'plugin_execution_time_ms',
  WEBHOOK_RESPONSE_TIME: 'webhook_response_time_ms',
  AUTHENTICATION_SUCCESS_RATE: 'auth_success_rate',
  PLATFORM_AVAILABILITY: 'platform_availability',
} as const;

/**
 * Regular expressions for validation
 */
export const REGEX_PATTERNS = {
  // GitHub patterns
  GITHUB_REPO: /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/,
  GITHUB_TOKEN: /^gh[ps]_[A-Za-z0-9_]+$/,
  
  // Jira patterns
  JIRA_ISSUE_KEY: /^[A-Z][A-Z0-9]+-\d+$/,
  JIRA_PROJECT_KEY: /^[A-Z][A-Z0-9]+$/,
  
  // General patterns
  URL: /^https?:\/\/[^\s]+$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  SEMANTIC_VERSION: /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/,
} as const;

/**
 * File size limits (in bytes)
 */
export const FILE_SIZE_LIMITS = {
  ATTACHMENT_MAX: 25 * 1024 * 1024, // 25MB
  CONFIG_MAX: 10 * 1024 * 1024, // 10MB
  LOG_MAX: 100 * 1024 * 1024, // 100MB
  PLUGIN_MAX: 50 * 1024 * 1024, // 50MB
  WEBHOOK_PAYLOAD_MAX: 5 * 1024 * 1024, // 5MB
} as const;