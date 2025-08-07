/**
 * Unified Project Management Interface Architecture
 * 
 * This module provides a unified interface for project management operations
 * across multiple platforms (GitHub Projects, Jira, Azure DevOps, etc.).
 * 
 * @example Basic Usage
 * ```typescript
 * import { UnifiedProjectManager, GitHubAdapter, JiraAdapter } from './project-management';
 * 
 * const manager = new UnifiedProjectManager();
 * 
 * // Register adapters
 * await manager.registerAdapter({
 *   adapter: new GitHubAdapter(),
 *   config: { platform: 'github', type: 'token', credentials: { token: 'ghp_xxx' } }
 * });
 * 
 * // Create project on any platform
 * const project = await manager.createProject({
 *   title: 'My Project',
 *   description: 'Cross-platform project',
 *   type: 'software'
 * });
 * ```
 */

// Core interfaces and types
export * from './core/interfaces.js';

// Main unified project manager
export { UnifiedProjectManager, type UnifiedProjectManagerConfig } from './core/unified-project-manager.js';

// Platform adapters
export { GitHubAdapter } from './adapters/github-adapter.js';
export { JiraAdapter } from './adapters/jira-adapter.js';

// Authentication management
export { 
  AuthManager, 
  type AuthManagerConfig,
  type StoredAuthConfig,
  type AuthValidationResult,
  type RefreshResult 
} from './auth/auth-manager.js';

// Event management
export { 
  EventManager, 
  type EventManagerConfig,
  type EventHandler,
  type ProcessedEvent,
  type WebhookEndpoint,
  type EventStats,
  type EventQuery 
} from './events/event-manager.js';

// Configuration management
export { 
  ConfigManager, 
  type ConfigManagerOptions,
  type UnifiedConfig,
  type PlatformConfig,
  type ConfigValidationResult 
} from './config/config-manager.js';

// Plugin system
export { 
  PluginManager, 
  type PluginManagerConfig,
  type Plugin,
  type PluginMetadata,
  type LoadedPlugin,
  type PluginContext,
  type PluginLogger,
  type PluginStorage,
  type PluginCacheStorage 
} from './plugins/plugin-manager.js';

// Utility functions and factory methods
export {
  createUnifiedProjectManager,
  createDefaultConfiguration,
  validatePlatformSupport,
  getPlatformCapabilities,
  createPlatformAdapter,
  createAuthConfig,
} from './utils.js';

// Constants and enums
export {
  SUPPORTED_PLATFORMS,
  DEFAULT_TIMEOUTS,
  DEFAULT_RATE_LIMITS,
  EVENT_TYPES,
  PLUGIN_TYPES,
} from './constants.js';