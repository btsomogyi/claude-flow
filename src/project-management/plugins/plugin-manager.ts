/**
 * Plugin Manager
 * 
 * Provides extensible plugin architecture for the unified project management system.
 * Supports dynamic plugin loading, lifecycle management, and inter-plugin communication.
 */

import { EventEmitter } from 'events';
import { readdir, readFile, stat } from 'fs/promises';
import { join, resolve } from 'path';
import type {
  ProjectPlatform,
  PlatformAdapter,
  ProjectEvent,
  EventType,
} from '../core/interfaces.js';

export interface PluginMetadata {
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords: string[];
  
  // Plugin-specific metadata
  pluginType: PluginType;
  apiVersion: string;
  dependencies: PluginDependency[];
  platforms?: ProjectPlatform[];
  
  // Lifecycle hooks
  hooks: {
    beforeLoad?: string; // Function name
    afterLoad?: string;
    beforeUnload?: string;
    afterUnload?: string;
  };
  
  // Configuration schema
  configSchema?: any; // JSON Schema
  defaultConfig?: any;
  
  // Permissions required by the plugin
  permissions: PluginPermission[];
  
  // Plugin capabilities
  capabilities: PluginCapability[];
}

export interface PluginDependency {
  name: string;
  version: string;
  optional?: boolean;
  pluginDependency?: boolean; // If true, depends on another plugin
}

export interface PluginPermission {
  type: 'file' | 'network' | 'system' | 'platform' | 'custom';
  resource: string;
  access: 'read' | 'write' | 'execute' | 'full';
  description: string;
}

export interface PluginCapability {
  type: PluginCapabilityType;
  description: string;
  methods?: string[]; // Public methods exposed by the plugin
  events?: EventType[]; // Events the plugin can handle/emit
}

export interface LoadedPlugin {
  metadata: PluginMetadata;
  instance: Plugin;
  config: any;
  status: PluginStatus;
  loadedAt: Date;
  lastActivity?: Date;
  errorCount: number;
  directory: string;
  module?: any; // The loaded module
}

export interface PluginContext {
  pluginManager: PluginManager;
  eventEmitter: EventEmitter;
  logger: PluginLogger;
  config: any;
  dataDirectory: string;
  tempDirectory: string;
  
  // API access
  getPlatformAdapter(platform: ProjectPlatform): PlatformAdapter | null;
  callPlugin(pluginName: string, method: string, ...args: any[]): Promise<any>;
  emitEvent(event: ProjectEvent): void;
  subscribeToEvents(types: EventType[], handler: (event: ProjectEvent) => void): string;
  unsubscribeFromEvents(subscriptionId: string): void;
  
  // Storage access
  getStorage(): PluginStorage;
  getCacheStorage(): PluginCacheStorage;
  
  // HTTP utilities
  makeHttpRequest(url: string, options?: any): Promise<any>;
  
  // File system utilities (sandboxed)
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  
  // Security utilities
  validatePermission(permission: PluginPermission): boolean;
  sanitizeInput(input: any): any;
}

export interface PluginLogger {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, error?: any): void;
}

export interface PluginStorage {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
  clear(): Promise<void>;
}

export interface PluginCacheStorage {
  get(key: string): Promise<any>;
  set(key: string, value: any, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface Plugin {
  // Required methods
  initialize(context: PluginContext): Promise<void>;
  shutdown(): Promise<void>;
  
  // Optional methods
  onEvent?(event: ProjectEvent): Promise<void>;
  onConfigChange?(newConfig: any, oldConfig: any): Promise<void>;
  getStatus?(): PluginStatusInfo;
  
  // Plugin-specific methods (defined by each plugin)
  [key: string]: any;
}

export interface PluginStatusInfo {
  healthy: boolean;
  message?: string;
  details?: any;
  metrics?: Record<string, number>;
}

export type PluginType = 
  | 'adapter' // Platform adapters
  | 'transformer' // Data transformers
  | 'handler' // Event handlers
  | 'ui' // UI extensions
  | 'integration' // Third-party integrations
  | 'utility' // Utility functions
  | 'workflow' // Workflow automation
  | 'notification' // Notification providers
  | 'storage' // Storage backends
  | 'auth' // Authentication providers
  | 'custom';

export type PluginStatus = 
  | 'loaded'
  | 'loading'
  | 'unloading'
  | 'unloaded'
  | 'error'
  | 'disabled';

export type PluginCapabilityType =
  | 'platform_adapter'
  | 'event_handler'
  | 'data_transformer'
  | 'ui_extension'
  | 'api_endpoint'
  | 'webhook_handler'
  | 'notification_provider'
  | 'storage_backend'
  | 'auth_provider'
  | 'workflow_step'
  | 'custom';

export interface PluginManagerConfig {
  pluginDirectories: string[];
  enableHotReload: boolean;
  enableSandboxing: boolean;
  maxPlugins: number;
  pluginTimeout: number; // milliseconds
  enablePluginApi: boolean;
  securityLevel: 'strict' | 'moderate' | 'permissive';
  dataDirectory: string;
  tempDirectory: string;
}

export class PluginManager extends EventEmitter {
  private config: PluginManagerConfig;
  private loadedPlugins: Map<string, LoadedPlugin> = new Map();
  private pluginDependencyGraph: Map<string, string[]> = new Map();
  private eventSubscriptions: Map<string, string[]> = new Map(); // subscriptionId -> eventTypes
  private watchers: any[] = [];

  constructor(config: Partial<PluginManagerConfig> = {}) {
    super();
    
    this.config = {
      pluginDirectories: ['./plugins'],
      enableHotReload: false,
      enableSandboxing: true,
      maxPlugins: 50,
      pluginTimeout: 30000,
      enablePluginApi: true,
      securityLevel: 'moderate',
      dataDirectory: './plugin-data',
      tempDirectory: './plugin-temp',
      ...config,
    };
  }

  // ========================================================================
  // INITIALIZATION AND SHUTDOWN
  // ========================================================================

  async initialize(): Promise<void> {
    try {
      // Create directories
      await this.createDirectories();
      
      // Discover and load plugins
      await this.discoverPlugins();
      
      // Setup hot reload if enabled
      if (this.config.enableHotReload) {
        await this.setupHotReload();
      }
      
      this.emit('plugin_manager:initialized', {
        pluginCount: this.loadedPlugins.size,
        directories: this.config.pluginDirectories,
      });
    } catch (error) {
      this.emit('plugin_manager:error', { action: 'initialize', error });
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    try {
      // Stop hot reload watchers
      for (const watcher of this.watchers) {
        if (watcher && typeof watcher.close === 'function') {
          await watcher.close();
        }
      }
      this.watchers = [];

      // Unload all plugins in reverse dependency order
      const unloadOrder = this.calculateUnloadOrder();
      for (const pluginName of unloadOrder) {
        await this.unloadPlugin(pluginName);
      }

      this.emit('plugin_manager:shutdown');
    } catch (error) {
      this.emit('plugin_manager:error', { action: 'shutdown', error });
      throw error;
    }
  }

  // ========================================================================
  // PLUGIN DISCOVERY AND LOADING
  // ========================================================================

  async discoverPlugins(): Promise<void> {
    for (const directory of this.config.pluginDirectories) {
      try {
        await this.scanDirectory(directory);
      } catch (error) {
        this.emit('plugin_manager:warning', {
          message: `Failed to scan plugin directory: ${directory}`,
          error,
        });
      }
    }
  }

  async loadPlugin(pluginPath: string, config?: any): Promise<void> {
    try {
      // Read plugin metadata
      const metadata = await this.readPluginMetadata(pluginPath);
      
      // Check if plugin is already loaded
      if (this.loadedPlugins.has(metadata.name)) {
        throw new Error(`Plugin already loaded: ${metadata.name}`);
      }

      // Check plugin limit
      if (this.loadedPlugins.size >= this.config.maxPlugins) {
        throw new Error(`Maximum plugin limit reached: ${this.config.maxPlugins}`);
      }

      // Validate plugin
      await this.validatePlugin(metadata, pluginPath);

      // Check dependencies
      await this.checkDependencies(metadata);

      // Create plugin context
      const pluginConfig = config || metadata.defaultConfig || {};
      const context = this.createPluginContext(metadata.name, pluginConfig);

      // Load plugin module
      const module = await this.loadPluginModule(pluginPath, metadata);
      
      // Create plugin instance
      const pluginInstance = this.createPluginInstance(module, metadata);

      // Execute before load hook
      if (metadata.hooks.beforeLoad) {
        await this.executeHook(pluginInstance, metadata.hooks.beforeLoad);
      }

      // Initialize plugin
      await pluginInstance.initialize(context);

      // Create loaded plugin record
      const loadedPlugin: LoadedPlugin = {
        metadata,
        instance: pluginInstance,
        config: pluginConfig,
        status: 'loaded',
        loadedAt: new Date(),
        errorCount: 0,
        directory: pluginPath,
        module,
      };

      this.loadedPlugins.set(metadata.name, loadedPlugin);

      // Update dependency graph
      this.updateDependencyGraph(metadata);

      // Execute after load hook
      if (metadata.hooks.afterLoad) {
        await this.executeHook(pluginInstance, metadata.hooks.afterLoad);
      }

      this.emit('plugin:loaded', {
        name: metadata.name,
        version: metadata.version,
        type: metadata.pluginType,
      });
    } catch (error) {
      this.emit('plugin:error', {
        action: 'load',
        plugin: pluginPath,
        error,
      });
      throw error;
    }
  }

  async unloadPlugin(pluginName: string): Promise<void> {
    const loadedPlugin = this.loadedPlugins.get(pluginName);
    if (!loadedPlugin) {
      throw new Error(`Plugin not loaded: ${pluginName}`);
    }

    try {
      loadedPlugin.status = 'unloading';

      // Execute before unload hook
      if (loadedPlugin.metadata.hooks.beforeUnload) {
        await this.executeHook(loadedPlugin.instance, loadedPlugin.metadata.hooks.beforeUnload);
      }

      // Shutdown plugin
      await loadedPlugin.instance.shutdown();

      // Remove from dependency graph
      this.pluginDependencyGraph.delete(pluginName);

      // Execute after unload hook
      if (loadedPlugin.metadata.hooks.afterUnload) {
        await this.executeHook(loadedPlugin.instance, loadedPlugin.metadata.hooks.afterUnload);
      }

      // Remove from loaded plugins
      this.loadedPlugins.delete(pluginName);

      this.emit('plugin:unloaded', {
        name: pluginName,
        type: loadedPlugin.metadata.pluginType,
      });
    } catch (error) {
      loadedPlugin.status = 'error';
      loadedPlugin.errorCount++;
      
      this.emit('plugin:error', {
        action: 'unload',
        plugin: pluginName,
        error,
      });
      throw error;
    }
  }

  async reloadPlugin(pluginName: string): Promise<void> {
    const loadedPlugin = this.loadedPlugins.get(pluginName);
    if (!loadedPlugin) {
      throw new Error(`Plugin not loaded: ${pluginName}`);
    }

    const pluginPath = loadedPlugin.directory;
    const config = loadedPlugin.config;

    await this.unloadPlugin(pluginName);
    await this.loadPlugin(pluginPath, config);
  }

  // ========================================================================
  // PLUGIN INTERACTION
  // ========================================================================

  async callPlugin(pluginName: string, method: string, ...args: any[]): Promise<any> {
    const loadedPlugin = this.loadedPlugins.get(pluginName);
    if (!loadedPlugin || loadedPlugin.status !== 'loaded') {
      throw new Error(`Plugin not available: ${pluginName}`);
    }

    try {
      loadedPlugin.lastActivity = new Date();
      
      const result = await Promise.race([
        loadedPlugin.instance[method]?.(...args),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Plugin method timeout')), this.config.pluginTimeout)
        ),
      ]);

      return result;
    } catch (error) {
      loadedPlugin.errorCount++;
      this.emit('plugin:error', {
        action: 'call',
        plugin: pluginName,
        method,
        error,
      });
      throw error;
    }
  }

  async notifyPlugins(event: ProjectEvent): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [pluginName, loadedPlugin] of this.loadedPlugins) {
      if (loadedPlugin.status === 'loaded' && loadedPlugin.instance.onEvent) {
        const canHandle = this.pluginCanHandleEvent(loadedPlugin, event);
        
        if (canHandle) {
          promises.push(
            this.callPlugin(pluginName, 'onEvent', event).catch(error => {
              this.emit('plugin:error', {
                action: 'event_notification',
                plugin: pluginName,
                event: event.type,
                error,
              });
            })
          );
        }
      }
    }

    await Promise.allSettled(promises);
  }

  // ========================================================================
  // PLUGIN MANAGEMENT
  // ========================================================================

  listPlugins(): Array<{
    name: string;
    version: string;
    type: PluginType;
    status: PluginStatus;
    description: string;
    loadedAt?: Date;
    lastActivity?: Date;
    errorCount: number;
    capabilities: PluginCapability[];
  }> {
    return Array.from(this.loadedPlugins.values()).map(plugin => ({
      name: plugin.metadata.name,
      version: plugin.metadata.version,
      type: plugin.metadata.pluginType,
      status: plugin.status,
      description: plugin.metadata.description,
      loadedAt: plugin.loadedAt,
      lastActivity: plugin.lastActivity,
      errorCount: plugin.errorCount,
      capabilities: plugin.metadata.capabilities,
    }));
  }

  getPlugin(name: string): LoadedPlugin | null {
    return this.loadedPlugins.get(name) || null;
  }

  getPluginsByType(type: PluginType): LoadedPlugin[] {
    return Array.from(this.loadedPlugins.values())
      .filter(plugin => plugin.metadata.pluginType === type);
  }

  getPluginsByCapability(capabilityType: PluginCapabilityType): LoadedPlugin[] {
    return Array.from(this.loadedPlugins.values())
      .filter(plugin => 
        plugin.metadata.capabilities.some(cap => cap.type === capabilityType)
      );
  }

  async getPluginStatus(pluginName: string): Promise<PluginStatusInfo | null> {
    const loadedPlugin = this.loadedPlugins.get(pluginName);
    if (!loadedPlugin || loadedPlugin.status !== 'loaded') {
      return null;
    }

    try {
      if (loadedPlugin.instance.getStatus) {
        return await this.callPlugin(pluginName, 'getStatus');
      }

      return {
        healthy: loadedPlugin.status === 'loaded',
        message: 'Plugin is loaded and ready',
      };
    } catch (error) {
      return {
        healthy: false,
        message: 'Failed to get plugin status',
        details: { error: error.message },
      };
    }
  }

  // ========================================================================
  // PRIVATE HELPER METHODS
  // ========================================================================

  private async createDirectories(): Promise<void> {
    const { mkdir } = await import('fs/promises');
    
    for (const dir of [this.config.dataDirectory, this.config.tempDirectory]) {
      try {
        await mkdir(dir, { recursive: true });
      } catch (error) {
        // Directory might already exist
      }
    }
  }

  private async scanDirectory(directory: string): Promise<void> {
    try {
      const entries = await readdir(directory);
      
      for (const entry of entries) {
        const entryPath = join(directory, entry);
        const stats = await stat(entryPath);
        
        if (stats.isDirectory()) {
          // Check if it's a plugin directory (has plugin.json or package.json)
          const metadataPath = join(entryPath, 'plugin.json');
          const packagePath = join(entryPath, 'package.json');
          
          try {
            await stat(metadataPath);
            await this.loadPlugin(entryPath);
          } catch {
            try {
              await stat(packagePath);
              // Check if package.json indicates it's a plugin
              const packageContent = await readFile(packagePath, 'utf-8');
              const packageJson = JSON.parse(packageContent);
              
              if (packageJson.claudeFlowPlugin || packageJson.keywords?.includes('claude-flow-plugin')) {
                await this.loadPlugin(entryPath);
              }
            } catch {
              // Not a plugin directory
            }
          }
        }
      }
    } catch (error) {
      throw new Error(`Failed to scan directory ${directory}: ${error}`);
    }
  }

  private async readPluginMetadata(pluginPath: string): Promise<PluginMetadata> {
    const metadataPath = join(pluginPath, 'plugin.json');
    const packagePath = join(pluginPath, 'package.json');
    
    try {
      // Try plugin.json first
      const content = await readFile(metadataPath, 'utf-8');
      return JSON.parse(content) as PluginMetadata;
    } catch {
      // Fallback to package.json
      try {
        const content = await readFile(packagePath, 'utf-8');
        const packageJson = JSON.parse(content);
        
        // Convert package.json to plugin metadata
        return this.convertPackageJsonToMetadata(packageJson);
      } catch (error) {
        throw new Error(`Failed to read plugin metadata from ${pluginPath}: ${error}`);
      }
    }
  }

  private convertPackageJsonToMetadata(packageJson: any): PluginMetadata {
    const pluginConfig = packageJson.claudeFlowPlugin || {};
    
    return {
      name: packageJson.name,
      version: packageJson.version,
      description: packageJson.description || '',
      author: packageJson.author || '',
      homepage: packageJson.homepage,
      repository: packageJson.repository?.url,
      license: packageJson.license,
      keywords: packageJson.keywords || [],
      pluginType: pluginConfig.type || 'custom',
      apiVersion: pluginConfig.apiVersion || '1.0.0',
      dependencies: packageJson.dependencies ? 
        Object.entries(packageJson.dependencies).map(([name, version]) => ({
          name,
          version: version as string,
        })) : [],
      platforms: pluginConfig.platforms,
      hooks: pluginConfig.hooks || {},
      configSchema: pluginConfig.configSchema,
      defaultConfig: pluginConfig.defaultConfig,
      permissions: pluginConfig.permissions || [],
      capabilities: pluginConfig.capabilities || [],
    };
  }

  private async validatePlugin(metadata: PluginMetadata, pluginPath: string): Promise<void> {
    // Validate required fields
    if (!metadata.name || !metadata.version || !metadata.pluginType) {
      throw new Error('Plugin metadata missing required fields: name, version, pluginType');
    }

    // Validate API version compatibility
    if (!this.isApiVersionCompatible(metadata.apiVersion)) {
      throw new Error(`Incompatible API version: ${metadata.apiVersion}`);
    }

    // Validate permissions if in strict security mode
    if (this.config.securityLevel === 'strict') {
      await this.validatePluginPermissions(metadata.permissions);
    }

    // Check if main entry point exists
    const mainPath = join(pluginPath, 'index.js');
    try {
      await stat(mainPath);
    } catch {
      throw new Error(`Plugin entry point not found: ${mainPath}`);
    }
  }

  private async checkDependencies(metadata: PluginMetadata): Promise<void> {
    for (const dep of metadata.dependencies) {
      if (dep.pluginDependency) {
        if (!this.loadedPlugins.has(dep.name)) {
          if (!dep.optional) {
            throw new Error(`Required plugin dependency not loaded: ${dep.name}`);
          }
        }
      } else {
        // Check if npm dependency is available
        try {
          require.resolve(dep.name);
        } catch {
          if (!dep.optional) {
            throw new Error(`Required npm dependency not installed: ${dep.name}`);
          }
        }
      }
    }
  }

  private createPluginContext(pluginName: string, config: any): PluginContext {
    const pluginDataDir = join(this.config.dataDirectory, pluginName);
    const pluginTempDir = join(this.config.tempDirectory, pluginName);

    return {
      pluginManager: this,
      eventEmitter: this,
      logger: this.createPluginLogger(pluginName),
      config,
      dataDirectory: pluginDataDir,
      tempDirectory: pluginTempDir,
      
      getPlatformAdapter: (platform: ProjectPlatform) => {
        // This would be injected from the main system
        return null;
      },
      
      callPlugin: async (pluginName: string, method: string, ...args: any[]) => {
        return this.callPlugin(pluginName, method, ...args);
      },
      
      emitEvent: (event: ProjectEvent) => {
        this.emit('plugin:event', event);
      },
      
      subscribeToEvents: (types: EventType[], handler: (event: ProjectEvent) => void) => {
        const subscriptionId = `${pluginName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.eventSubscriptions.set(subscriptionId, types);
        
        // Setup event listener
        this.on('plugin:event', (event: ProjectEvent) => {
          if (types.includes(event.type)) {
            handler(event);
          }
        });
        
        return subscriptionId;
      },
      
      unsubscribeFromEvents: (subscriptionId: string) => {
        this.eventSubscriptions.delete(subscriptionId);
        // Remove event listener logic would go here
      },
      
      getStorage: () => this.createPluginStorage(pluginName),
      getCacheStorage: () => this.createPluginCacheStorage(pluginName),
      
      makeHttpRequest: async (url: string, options?: any) => {
        // Implement HTTP request with proper sandboxing
        return fetch(url, options);
      },
      
      readFile: async (path: string) => {
        // Implement sandboxed file reading
        const safePath = resolve(pluginDataDir, path);
        if (!safePath.startsWith(pluginDataDir)) {
          throw new Error('Access denied: Path outside plugin directory');
        }
        return readFile(safePath, 'utf-8');
      },
      
      writeFile: async (path: string, content: string) => {
        // Implement sandboxed file writing
        const { writeFile } = await import('fs/promises');
        const safePath = resolve(pluginDataDir, path);
        if (!safePath.startsWith(pluginDataDir)) {
          throw new Error('Access denied: Path outside plugin directory');
        }
        return writeFile(safePath, content, 'utf-8');
      },
      
      exists: async (path: string) => {
        const safePath = resolve(pluginDataDir, path);
        if (!safePath.startsWith(pluginDataDir)) {
          return false;
        }
        try {
          await stat(safePath);
          return true;
        } catch {
          return false;
        }
      },
      
      validatePermission: (permission: PluginPermission) => {
        return this.validatePluginPermission(pluginName, permission);
      },
      
      sanitizeInput: (input: any) => {
        // Implement input sanitization
        return input;
      },
    };
  }

  private createPluginLogger(pluginName: string): PluginLogger {
    return {
      debug: (message: string, meta?: any) => {
        this.emit('plugin:log', { level: 'debug', plugin: pluginName, message, meta });
      },
      info: (message: string, meta?: any) => {
        this.emit('plugin:log', { level: 'info', plugin: pluginName, message, meta });
      },
      warn: (message: string, meta?: any) => {
        this.emit('plugin:log', { level: 'warn', plugin: pluginName, message, meta });
      },
      error: (message: string, error?: any) => {
        this.emit('plugin:log', { level: 'error', plugin: pluginName, message, error });
      },
    };
  }

  private createPluginStorage(pluginName: string): PluginStorage {
    // This would be a persistent storage implementation
    // For now, returning a simple in-memory implementation
    const storage = new Map<string, any>();
    
    return {
      get: async (key: string) => storage.get(key),
      set: async (key: string, value: any) => { storage.set(key, value); },
      delete: async (key: string) => { storage.delete(key); },
      list: async () => Array.from(storage.keys()),
      clear: async () => { storage.clear(); },
    };
  }

  private createPluginCacheStorage(pluginName: string): PluginCacheStorage {
    // This would be a cache storage implementation with TTL
    const cache = new Map<string, { value: any; expires: number }>();
    
    return {
      get: async (key: string) => {
        const entry = cache.get(key);
        if (!entry || Date.now() > entry.expires) {
          cache.delete(key);
          return undefined;
        }
        return entry.value;
      },
      set: async (key: string, value: any, ttl: number = 300000) => {
        cache.set(key, { value, expires: Date.now() + ttl });
      },
      delete: async (key: string) => { cache.delete(key); },
      clear: async () => { cache.clear(); },
    };
  }

  private async loadPluginModule(pluginPath: string, metadata: PluginMetadata): Promise<any> {
    const mainPath = join(pluginPath, 'index.js');
    
    if (this.config.enableSandboxing) {
      // Implement module sandboxing
      // For now, just use regular require
      delete require.cache[require.resolve(mainPath)];
      return require(mainPath);
    } else {
      delete require.cache[require.resolve(mainPath)];
      return require(mainPath);
    }
  }

  private createPluginInstance(module: any, metadata: PluginMetadata): Plugin {
    if (typeof module === 'function') {
      return new module();
    } else if (module.default && typeof module.default === 'function') {
      return new module.default();
    } else if (module.Plugin && typeof module.Plugin === 'function') {
      return new module.Plugin();
    } else {
      throw new Error(`Invalid plugin module structure: ${metadata.name}`);
    }
  }

  private async executeHook(plugin: Plugin, hookName: string): Promise<void> {
    if (typeof plugin[hookName] === 'function') {
      await plugin[hookName]();
    }
  }

  private updateDependencyGraph(metadata: PluginMetadata): void {
    const dependencies = metadata.dependencies
      .filter(dep => dep.pluginDependency)
      .map(dep => dep.name);
    
    this.pluginDependencyGraph.set(metadata.name, dependencies);
  }

  private calculateUnloadOrder(): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (pluginName: string) => {
      if (visited.has(pluginName)) return;
      if (visiting.has(pluginName)) {
        throw new Error(`Circular dependency detected involving plugin: ${pluginName}`);
      }

      visiting.add(pluginName);
      
      // Find plugins that depend on this one
      for (const [name, deps] of this.pluginDependencyGraph) {
        if (deps.includes(pluginName)) {
          visit(name);
        }
      }

      visiting.delete(pluginName);
      visited.add(pluginName);
      order.push(pluginName);
    };

    for (const pluginName of this.loadedPlugins.keys()) {
      visit(pluginName);
    }

    return order;
  }

  private pluginCanHandleEvent(loadedPlugin: LoadedPlugin, event: ProjectEvent): boolean {
    // Check if plugin can handle this event type
    const eventCapabilities = loadedPlugin.metadata.capabilities
      .filter(cap => cap.type === 'event_handler')
      .flatMap(cap => cap.events || []);

    if (eventCapabilities.length > 0 && !eventCapabilities.includes(event.type)) {
      return false;
    }

    // Check if plugin supports this platform
    if (loadedPlugin.metadata.platforms && !loadedPlugin.metadata.platforms.includes(event.platform)) {
      return false;
    }

    return true;
  }

  private isApiVersionCompatible(apiVersion: string): boolean {
    // Simple version compatibility check
    const [major] = apiVersion.split('.').map(Number);
    return major === 1; // Only support API version 1.x for now
  }

  private async validatePluginPermissions(permissions: PluginPermission[]): Promise<void> {
    for (const permission of permissions) {
      if (permission.type === 'system' && permission.access === 'full') {
        throw new Error('System-level full access permissions are not allowed in strict security mode');
      }
    }
  }

  private validatePluginPermission(pluginName: string, permission: PluginPermission): boolean {
    const loadedPlugin = this.loadedPlugins.get(pluginName);
    if (!loadedPlugin) return false;

    return loadedPlugin.metadata.permissions.some(p => 
      p.type === permission.type && 
      p.resource === permission.resource &&
      (p.access === permission.access || p.access === 'full')
    );
  }

  private async setupHotReload(): Promise<void> {
    const { watch } = await import('fs/promises');
    
    for (const directory of this.config.pluginDirectories) {
      try {
        const watcher = watch(directory, { recursive: true });
        this.watchers.push(watcher);
        
        (async () => {
          for await (const event of watcher) {
            if (event.eventType === 'change' && event.filename) {
              await this.handleFileChange(join(directory, event.filename));
            }
          }
        })().catch(error => {
          this.emit('plugin_manager:error', { action: 'hot_reload', error });
        });
      } catch (error) {
        this.emit('plugin_manager:warning', {
          message: `Failed to setup hot reload for directory: ${directory}`,
          error,
        });
      }
    }
  }

  private async handleFileChange(filePath: string): Promise<void> {
    // Find plugin that owns this file
    const pluginName = this.findPluginByFilePath(filePath);
    if (pluginName && this.loadedPlugins.has(pluginName)) {
      try {
        await this.reloadPlugin(pluginName);
        this.emit('plugin:hot_reloaded', { plugin: pluginName, file: filePath });
      } catch (error) {
        this.emit('plugin:hot_reload_failed', { plugin: pluginName, file: filePath, error });
      }
    }
  }

  private findPluginByFilePath(filePath: string): string | null {
    for (const [pluginName, loadedPlugin] of this.loadedPlugins) {
      if (filePath.startsWith(loadedPlugin.directory)) {
        return pluginName;
      }
    }
    return null;
  }
}