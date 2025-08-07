/**
 * Authentication Manager
 * 
 * Provides unified authentication management for different project management platforms.
 * Supports multiple authentication types, token refresh, and secure credential storage.
 */

import { EventEmitter } from 'events';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type {
  ProjectPlatform,
  AuthConfig,
  AuthType,
  AuthCredentials,
  RefreshConfig,
} from '../core/interfaces.js';

export interface AuthManagerConfig {
  storageDirectory: string;
  encryptionEnabled: boolean;
  encryptionKey?: string;
  defaultTokenRefreshBuffer: number; // minutes
  maxRetryAttempts: number;
  enableAutoRefresh: boolean;
}

export interface StoredAuthConfig extends AuthConfig {
  id: string;
  alias?: string;
  isDefault?: boolean;
  isActive: boolean;
  expiresAt?: Date;
  lastRefreshed?: Date;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthValidationResult {
  isValid: boolean;
  isExpired: boolean;
  expiresIn?: number; // minutes until expiration
  needsRefresh: boolean;
  error?: string;
}

export interface RefreshResult {
  success: boolean;
  newToken?: string;
  expiresAt?: Date;
  error?: string;
}

export class AuthManager extends EventEmitter {
  private config: AuthManagerConfig;
  private authConfigs: Map<string, StoredAuthConfig> = new Map();
  private refreshTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: Partial<AuthManagerConfig> = {}) {
    super();
    
    this.config = {
      storageDirectory: './auth',
      encryptionEnabled: false,
      defaultTokenRefreshBuffer: 30, // 30 minutes
      maxRetryAttempts: 3,
      enableAutoRefresh: true,
      ...config,
    };
  }

  // ========================================================================
  // INITIALIZATION AND STORAGE
  // ========================================================================

  async initialize(): Promise<void> {
    try {
      await mkdir(this.config.storageDirectory, { recursive: true });
      await this.loadAuthConfigs();
      
      if (this.config.enableAutoRefresh) {
        this.setupAutoRefresh();
      }

      this.emit('auth_manager:initialized');
    } catch (error) {
      this.emit('auth_manager:error', { action: 'initialize', error });
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    // Clear all refresh timers
    for (const [id, timer] of this.refreshTimers) {
      clearTimeout(timer);
      this.refreshTimers.delete(id);
    }

    // Save all auth configs
    await this.saveAllAuthConfigs();
    
    this.emit('auth_manager:shutdown');
  }

  // ========================================================================
  // AUTH CONFIG MANAGEMENT
  // ========================================================================

  async addAuthConfig(
    authConfig: AuthConfig,
    options: {
      alias?: string;
      isDefault?: boolean;
      expiresAt?: Date;
      overwrite?: boolean;
    } = {}
  ): Promise<string> {
    const id = this.generateAuthConfigId(authConfig.platform, options.alias);
    
    // Check if config already exists
    if (this.authConfigs.has(id) && !options.overwrite) {
      throw new Error(`Auth configuration already exists: ${id}`);
    }

    // Validate the auth config
    const validationResult = await this.validateAuthConfig(authConfig);
    if (!validationResult.isValid) {
      throw new Error(`Invalid auth configuration: ${validationResult.error}`);
    }

    // Encrypt credentials if encryption is enabled
    const credentials = this.config.encryptionEnabled 
      ? this.encryptCredentials(authConfig.credentials)
      : authConfig.credentials;

    const storedConfig: StoredAuthConfig = {
      ...authConfig,
      id,
      alias: options.alias,
      credentials,
      isDefault: options.isDefault || false,
      isActive: true,
      expiresAt: options.expiresAt,
      failureCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // If this is set as default, unset other defaults for the same platform
    if (options.isDefault) {
      await this.unsetDefaultForPlatform(authConfig.platform, id);
    }

    this.authConfigs.set(id, storedConfig);
    await this.saveAuthConfig(storedConfig);

    // Setup auto-refresh if needed
    if (this.config.enableAutoRefresh && this.shouldAutoRefresh(storedConfig)) {
      this.scheduleTokenRefresh(storedConfig);
    }

    this.emit('auth_config:added', { id, platform: authConfig.platform });
    return id;
  }

  async updateAuthConfig(
    id: string, 
    updates: Partial<AuthConfig & { alias?: string; isDefault?: boolean; expiresAt?: Date }>
  ): Promise<void> {
    const config = this.authConfigs.get(id);
    if (!config) {
      throw new Error(`Auth configuration not found: ${id}`);
    }

    const updatedConfig: StoredAuthConfig = {
      ...config,
      ...updates,
      updatedAt: new Date(),
    };

    // Encrypt credentials if they were updated and encryption is enabled
    if (updates.credentials && this.config.encryptionEnabled) {
      updatedConfig.credentials = this.encryptCredentials(updates.credentials);
    }

    // Validate if auth config properties were updated
    if (updates.type || updates.credentials || updates.baseUrl) {
      const validationResult = await this.validateAuthConfig(updatedConfig);
      if (!validationResult.isValid) {
        throw new Error(`Invalid auth configuration update: ${validationResult.error}`);
      }
    }

    // Handle default flag
    if (updates.isDefault) {
      await this.unsetDefaultForPlatform(config.platform, id);
    }

    this.authConfigs.set(id, updatedConfig);
    await this.saveAuthConfig(updatedConfig);

    // Update auto-refresh schedule
    if (this.config.enableAutoRefresh) {
      this.clearRefreshTimer(id);
      if (this.shouldAutoRefresh(updatedConfig)) {
        this.scheduleTokenRefresh(updatedConfig);
      }
    }

    this.emit('auth_config:updated', { id, platform: config.platform });
  }

  async removeAuthConfig(id: string): Promise<void> {
    const config = this.authConfigs.get(id);
    if (!config) {
      throw new Error(`Auth configuration not found: ${id}`);
    }

    // Clear auto-refresh timer
    this.clearRefreshTimer(id);

    // Remove from memory and storage
    this.authConfigs.delete(id);
    await this.deleteAuthConfigFile(id);

    this.emit('auth_config:removed', { id, platform: config.platform });
  }

  getAuthConfig(id: string): StoredAuthConfig | null {
    const config = this.authConfigs.get(id);
    if (!config) return null;

    // Decrypt credentials if needed
    const credentials = this.config.encryptionEnabled
      ? this.decryptCredentials(config.credentials)
      : config.credentials;

    return {
      ...config,
      credentials,
    };
  }

  getAuthConfigsByPlatform(platform: ProjectPlatform): StoredAuthConfig[] {
    return Array.from(this.authConfigs.values())
      .filter(config => config.platform === platform)
      .map(config => ({
        ...config,
        credentials: this.config.encryptionEnabled
          ? this.decryptCredentials(config.credentials)
          : config.credentials,
      }));
  }

  getDefaultAuthConfig(platform: ProjectPlatform): StoredAuthConfig | null {
    const configs = this.getAuthConfigsByPlatform(platform);
    return configs.find(config => config.isDefault) || configs[0] || null;
  }

  listAuthConfigs(): Array<{
    id: string;
    platform: ProjectPlatform;
    alias?: string;
    type: AuthType;
    isDefault: boolean;
    isActive: boolean;
    isExpired: boolean;
    expiresAt?: Date;
    lastRefreshed?: Date;
    failureCount: number;
  }> {
    return Array.from(this.authConfigs.values()).map(config => ({
      id: config.id,
      platform: config.platform,
      alias: config.alias,
      type: config.type,
      isDefault: config.isDefault,
      isActive: config.isActive,
      isExpired: this.isTokenExpired(config),
      expiresAt: config.expiresAt,
      lastRefreshed: config.lastRefreshed,
      failureCount: config.failureCount,
    }));
  }

  // ========================================================================
  // VALIDATION AND TESTING
  // ========================================================================

  async validateAuthConfig(authConfig: AuthConfig): Promise<AuthValidationResult> {
    try {
      // Basic validation
      if (!authConfig.platform) {
        return { isValid: false, isExpired: false, needsRefresh: false, error: 'Platform is required' };
      }

      if (!authConfig.type) {
        return { isValid: false, isExpired: false, needsRefresh: false, error: 'Auth type is required' };
      }

      if (!authConfig.credentials) {
        return { isValid: false, isExpired: false, needsRefresh: false, error: 'Credentials are required' };
      }

      // Type-specific validation
      const typeValidation = this.validateCredentialsForType(authConfig.type, authConfig.credentials);
      if (!typeValidation.isValid) {
        return typeValidation;
      }

      // Check expiration
      const isExpired = this.isTokenExpired(authConfig as StoredAuthConfig);
      const expiresIn = this.getTokenExpirationMinutes(authConfig as StoredAuthConfig);
      const needsRefresh = this.shouldRefreshToken(authConfig as StoredAuthConfig);

      return {
        isValid: true,
        isExpired,
        expiresIn,
        needsRefresh,
      };
    } catch (error) {
      return {
        isValid: false,
        isExpired: false,
        needsRefresh: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }

  async testAuthConfig(id: string): Promise<AuthValidationResult> {
    const config = this.getAuthConfig(id);
    if (!config) {
      return { isValid: false, isExpired: false, needsRefresh: false, error: 'Config not found' };
    }

    // This would need to be implemented by each platform adapter
    // For now, just validate the configuration structure
    return this.validateAuthConfig(config);
  }

  // ========================================================================
  // TOKEN REFRESH
  // ========================================================================

  async refreshToken(id: string): Promise<RefreshResult> {
    const config = this.authConfigs.get(id);
    if (!config) {
      return { success: false, error: 'Auth configuration not found' };
    }

    if (!config.refreshConfig?.enabled) {
      return { success: false, error: 'Token refresh is not enabled for this configuration' };
    }

    try {
      const refreshResult = await this.performTokenRefresh(config);
      
      if (refreshResult.success) {
        // Update the stored configuration
        const updatedConfig: StoredAuthConfig = {
          ...config,
          credentials: {
            ...config.credentials,
            token: refreshResult.newToken,
          },
          expiresAt: refreshResult.expiresAt,
          lastRefreshed: new Date(),
          failureCount: 0,
          updatedAt: new Date(),
        };

        this.authConfigs.set(id, updatedConfig);
        await this.saveAuthConfig(updatedConfig);

        // Reschedule next refresh
        if (this.config.enableAutoRefresh) {
          this.scheduleTokenRefresh(updatedConfig);
        }

        this.emit('token:refreshed', { id, platform: config.platform });
      } else {
        // Increment failure count
        config.failureCount++;
        if (config.failureCount >= this.config.maxRetryAttempts) {
          config.isActive = false;
          this.emit('auth_config:deactivated', { id, platform: config.platform, reason: 'max_refresh_failures' });
        }

        this.authConfigs.set(id, { ...config, updatedAt: new Date() });
        await this.saveAuthConfig(config);

        this.emit('token:refresh_failed', { id, platform: config.platform, error: refreshResult.error });
      }

      return refreshResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown refresh error';
      this.emit('token:refresh_error', { id, platform: config.platform, error: errorMessage });
      
      return { success: false, error: errorMessage };
    }
  }

  async refreshAllExpiredTokens(): Promise<RefreshResult[]> {
    const expiredConfigs = Array.from(this.authConfigs.values())
      .filter(config => this.shouldRefreshToken(config) && config.refreshConfig?.enabled);

    const refreshPromises = expiredConfigs.map(config => this.refreshToken(config.id));
    return Promise.all(refreshPromises);
  }

  // ========================================================================
  // PRIVATE HELPER METHODS
  // ========================================================================

  private generateAuthConfigId(platform: ProjectPlatform, alias?: string): string {
    const base = alias ? `${platform}-${alias}` : platform;
    return `${base}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private validateCredentialsForType(type: AuthType, credentials: AuthCredentials): AuthValidationResult {
    switch (type) {
      case 'token':
        if (!credentials.token) {
          return { isValid: false, isExpired: false, needsRefresh: false, error: 'Token is required' };
        }
        break;

      case 'oauth':
        if (!credentials.clientId || !credentials.clientSecret) {
          return { isValid: false, isExpired: false, needsRefresh: false, error: 'OAuth client ID and secret are required' };
        }
        break;

      case 'basic':
        if (!credentials.username || !credentials.password) {
          return { isValid: false, isExpired: false, needsRefresh: false, error: 'Username and password are required' };
        }
        break;

      case 'app':
        if (!credentials.clientId || !credentials.privateKey) {
          return { isValid: false, isExpired: false, needsRefresh: false, error: 'App ID and private key are required' };
        }
        break;

      case 'certificate':
        if (!credentials.certificate || !credentials.privateKey) {
          return { isValid: false, isExpired: false, needsRefresh: false, error: 'Certificate and private key are required' };
        }
        break;

      case 'custom':
        // Custom validation would be handled by platform-specific logic
        break;

      default:
        return { isValid: false, isExpired: false, needsRefresh: false, error: `Unsupported auth type: ${type}` };
    }

    return { isValid: true, isExpired: false, needsRefresh: false };
  }

  private isTokenExpired(config: StoredAuthConfig): boolean {
    if (!config.expiresAt) return false;
    return new Date() >= config.expiresAt;
  }

  private getTokenExpirationMinutes(config: StoredAuthConfig): number | undefined {
    if (!config.expiresAt) return undefined;
    
    const now = new Date();
    const diffMs = config.expiresAt.getTime() - now.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60)));
  }

  private shouldRefreshToken(config: StoredAuthConfig): boolean {
    if (!config.expiresAt || !config.refreshConfig?.enabled) return false;

    const bufferMinutes = config.refreshConfig.expirationBuffer || this.config.defaultTokenRefreshBuffer;
    const refreshTime = new Date(config.expiresAt.getTime() - (bufferMinutes * 60 * 1000));
    
    return new Date() >= refreshTime;
  }

  private shouldAutoRefresh(config: StoredAuthConfig): boolean {
    return config.isActive && 
           config.refreshConfig?.enabled === true &&
           config.expiresAt !== undefined &&
           config.failureCount < this.config.maxRetryAttempts;
  }

  private scheduleTokenRefresh(config: StoredAuthConfig): void {
    if (!config.expiresAt) return;

    const bufferMinutes = config.refreshConfig?.expirationBuffer || this.config.defaultTokenRefreshBuffer;
    const refreshTime = new Date(config.expiresAt.getTime() - (bufferMinutes * 60 * 1000));
    const delay = Math.max(0, refreshTime.getTime() - Date.now());

    // Clear existing timer if any
    this.clearRefreshTimer(config.id);

    const timer = setTimeout(async () => {
      await this.refreshToken(config.id);
    }, delay);

    this.refreshTimers.set(config.id, timer);
  }

  private clearRefreshTimer(id: string): void {
    const timer = this.refreshTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.refreshTimers.delete(id);
    }
  }

  private setupAutoRefresh(): void {
    for (const config of this.authConfigs.values()) {
      if (this.shouldAutoRefresh(config)) {
        this.scheduleTokenRefresh(config);
      }
    }
  }

  private async unsetDefaultForPlatform(platform: ProjectPlatform, excludeId?: string): Promise<void> {
    const configs = Array.from(this.authConfigs.values())
      .filter(config => config.platform === platform && config.id !== excludeId);

    for (const config of configs) {
      if (config.isDefault) {
        config.isDefault = false;
        config.updatedAt = new Date();
        await this.saveAuthConfig(config);
      }
    }
  }

  private async performTokenRefresh(config: StoredAuthConfig): Promise<RefreshResult> {
    if (!config.refreshConfig?.endpoint) {
      return { success: false, error: 'No refresh endpoint configured' };
    }

    try {
      const response = await fetch(config.refreshConfig.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.refreshConfig.refreshToken}`,
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: config.refreshConfig.refreshToken,
          client_id: config.credentials.clientId,
          client_secret: config.credentials.clientSecret,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      const data = await response.json() as {
        access_token: string;
        expires_in: number;
        refresh_token?: string;
      };

      const expiresAt = new Date(Date.now() + (data.expires_in * 1000));

      // Update refresh token if provided
      if (data.refresh_token) {
        config.refreshConfig.refreshToken = data.refresh_token;
      }

      return {
        success: true,
        newToken: data.access_token,
        expiresAt,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown refresh error',
      };
    }
  }

  // ========================================================================
  // ENCRYPTION AND SECURITY
  // ========================================================================

  private encryptCredentials(credentials: AuthCredentials): AuthCredentials {
    if (!this.config.encryptionEnabled || !this.config.encryptionKey) {
      return credentials;
    }

    // Simple base64 encoding for demo - in production, use proper encryption
    const encrypted: AuthCredentials = {};
    
    for (const [key, value] of Object.entries(credentials)) {
      if (typeof value === 'string') {
        encrypted[key as keyof AuthCredentials] = Buffer.from(value).toString('base64');
      } else {
        encrypted[key as keyof AuthCredentials] = value;
      }
    }

    return encrypted;
  }

  private decryptCredentials(encryptedCredentials: AuthCredentials): AuthCredentials {
    if (!this.config.encryptionEnabled || !this.config.encryptionKey) {
      return encryptedCredentials;
    }

    // Simple base64 decoding for demo - in production, use proper decryption
    const decrypted: AuthCredentials = {};
    
    for (const [key, value] of Object.entries(encryptedCredentials)) {
      if (typeof value === 'string') {
        try {
          decrypted[key as keyof AuthCredentials] = Buffer.from(value, 'base64').toString('utf-8');
        } catch {
          decrypted[key as keyof AuthCredentials] = value; // Keep as-is if decryption fails
        }
      } else {
        decrypted[key as keyof AuthCredentials] = value;
      }
    }

    return decrypted;
  }

  // ========================================================================
  // FILE SYSTEM OPERATIONS
  // ========================================================================

  private async loadAuthConfigs(): Promise<void> {
    try {
      const configsFile = join(this.config.storageDirectory, 'auth-configs.json');
      const content = await readFile(configsFile, 'utf-8').catch(() => '{}');
      const data = JSON.parse(content) as Record<string, StoredAuthConfig>;

      for (const [id, config] of Object.entries(data)) {
        // Parse dates
        config.createdAt = new Date(config.createdAt);
        config.updatedAt = new Date(config.updatedAt);
        if (config.expiresAt) config.expiresAt = new Date(config.expiresAt);
        if (config.lastRefreshed) config.lastRefreshed = new Date(config.lastRefreshed);

        this.authConfigs.set(id, config);
      }
    } catch (error) {
      // If loading fails, start with empty configs
      console.warn('Failed to load auth configurations:', error);
    }
  }

  private async saveAuthConfig(config: StoredAuthConfig): Promise<void> {
    const configsFile = join(this.config.storageDirectory, 'auth-configs.json');
    const allConfigs = Object.fromEntries(this.authConfigs);
    await writeFile(configsFile, JSON.stringify(allConfigs, null, 2));
  }

  private async saveAllAuthConfigs(): Promise<void> {
    const configsFile = join(this.config.storageDirectory, 'auth-configs.json');
    const allConfigs = Object.fromEntries(this.authConfigs);
    await writeFile(configsFile, JSON.stringify(allConfigs, null, 2));
  }

  private async deleteAuthConfigFile(id: string): Promise<void> {
    // For this implementation, we just save without the deleted config
    await this.saveAllAuthConfigs();
  }
}