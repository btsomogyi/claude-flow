/**
 * Checkpoint State Manager
 * 
 * Manages session-scoped checkpoint toggle state using environment variables.
 * Provides granular control over different checkpoint hook types.
 */

export interface CheckpointState {
  globalEnabled: boolean;
  editHooks: boolean;
  taskHooks: boolean;
  sessionHooks: boolean;
  writeHooks: boolean;
}

export interface CheckpointSessionInfo {
  sessionId: string;
  startTime: Date;
  defaultState: CheckpointState;
  currentState: CheckpointState;
}

/**
 * Hook type mappings to environment variable names
 */
export const CHECKPOINT_ENV_VARS = {
  GLOBAL: 'CLAUDE_CHECKPOINTS_ENABLED',
  EDIT_HOOKS: 'CLAUDE_CHECKPOINTS_EDIT_HOOKS',
  TASK_HOOKS: 'CLAUDE_CHECKPOINTS_TASK_HOOKS', 
  SESSION_HOOKS: 'CLAUDE_CHECKPOINTS_SESSION_HOOKS',
  WRITE_HOOKS: 'CLAUDE_CHECKPOINTS_WRITE_HOOKS',
} as const;

/**
 * Hook type categories for granular control
 */
export const HOOK_TYPE_MAPPING = {
  'PreToolUse:Edit': 'editHooks',
  'PostToolUse:Edit': 'editHooks', 
  'PreToolUse:Write': 'writeHooks',
  'UserPromptSubmit': 'taskHooks',
  'Stop': 'sessionHooks',
} as const;

export class CheckpointStateManager {
  private sessionInfo: CheckpointSessionInfo | null = null;
  private defaultState: CheckpointState;

  constructor(sessionId?: string) {
    // Initialize with current environment state as defaults
    this.defaultState = this.readEnvironmentState();
    
    if (sessionId) {
      this.initializeSession(sessionId);
    }
  }

  /**
   * Initialize a new session with default state
   */
  initializeSession(sessionId: string): void {
    this.sessionInfo = {
      sessionId,
      startTime: new Date(),
      defaultState: { ...this.defaultState },
      currentState: { ...this.defaultState },
    };
  }

  /**
   * Read current checkpoint state from environment variables
   */
  private readEnvironmentState(): CheckpointState {
    return {
      globalEnabled: this.parseEnvBoolean(CHECKPOINT_ENV_VARS.GLOBAL, true),
      editHooks: this.parseEnvBoolean(CHECKPOINT_ENV_VARS.EDIT_HOOKS, true),
      taskHooks: this.parseEnvBoolean(CHECKPOINT_ENV_VARS.TASK_HOOKS, true), 
      sessionHooks: this.parseEnvBoolean(CHECKPOINT_ENV_VARS.SESSION_HOOKS, true),
      writeHooks: this.parseEnvBoolean(CHECKPOINT_ENV_VARS.WRITE_HOOKS, true),
    };
  }

  /**
   * Parse environment variable as boolean with default fallback
   */
  private parseEnvBoolean(envVar: string, defaultValue: boolean): boolean {
    const value = process.env[envVar];
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true';
  }

  /**
   * Set environment variable and update current state
   */
  private setEnvironmentVar(envVar: string, value: boolean): void {
    process.env[envVar] = value ? 'true' : 'false';
    
    // Update current state if session is initialized
    if (this.sessionInfo) {
      this.sessionInfo.currentState = this.readEnvironmentState();
    }
  }

  /**
   * Enable all checkpoint functionality
   */
  enableAll(): CheckpointState {
    this.setEnvironmentVar(CHECKPOINT_ENV_VARS.GLOBAL, true);
    this.setEnvironmentVar(CHECKPOINT_ENV_VARS.EDIT_HOOKS, true);
    this.setEnvironmentVar(CHECKPOINT_ENV_VARS.TASK_HOOKS, true);
    this.setEnvironmentVar(CHECKPOINT_ENV_VARS.SESSION_HOOKS, true);
    this.setEnvironmentVar(CHECKPOINT_ENV_VARS.WRITE_HOOKS, true);
    
    return this.getCurrentState();
  }

  /**
   * Disable all checkpoint functionality
   */
  disableAll(): CheckpointState {
    this.setEnvironmentVar(CHECKPOINT_ENV_VARS.GLOBAL, false);
    
    return this.getCurrentState();
  }

  /**
   * Toggle global checkpoint state
   */
  toggleGlobal(enabled?: boolean): CheckpointState {
    const currentEnabled = this.parseEnvBoolean(CHECKPOINT_ENV_VARS.GLOBAL, true);
    const newEnabled = enabled !== undefined ? enabled : !currentEnabled;
    
    this.setEnvironmentVar(CHECKPOINT_ENV_VARS.GLOBAL, newEnabled);
    
    return this.getCurrentState();
  }

  /**
   * Toggle edit hooks (PreToolUse:Edit, PostToolUse:Edit)
   */
  toggleEditHooks(enabled?: boolean): CheckpointState {
    const currentEnabled = this.parseEnvBoolean(CHECKPOINT_ENV_VARS.EDIT_HOOKS, true);
    const newEnabled = enabled !== undefined ? enabled : !currentEnabled;
    
    this.setEnvironmentVar(CHECKPOINT_ENV_VARS.EDIT_HOOKS, newEnabled);
    
    return this.getCurrentState();
  }

  /**
   * Toggle task hooks (UserPromptSubmit)
   */
  toggleTaskHooks(enabled?: boolean): CheckpointState {
    const currentEnabled = this.parseEnvBoolean(CHECKPOINT_ENV_VARS.TASK_HOOKS, true);
    const newEnabled = enabled !== undefined ? enabled : !currentEnabled;
    
    this.setEnvironmentVar(CHECKPOINT_ENV_VARS.TASK_HOOKS, newEnabled);
    
    return this.getCurrentState();
  }

  /**
   * Toggle session hooks (Stop)
   */
  toggleSessionHooks(enabled?: boolean): CheckpointState {
    const currentEnabled = this.parseEnvBoolean(CHECKPOINT_ENV_VARS.SESSION_HOOKS, true);
    const newEnabled = enabled !== undefined ? enabled : !currentEnabled;
    
    this.setEnvironmentVar(CHECKPOINT_ENV_VARS.SESSION_HOOKS, newEnabled);
    
    return this.getCurrentState();
  }

  /**
   * Toggle write hooks (PreToolUse:Write)
   */
  toggleWriteHooks(enabled?: boolean): CheckpointState {
    const currentEnabled = this.parseEnvBoolean(CHECKPOINT_ENV_VARS.WRITE_HOOKS, true);
    const newEnabled = enabled !== undefined ? enabled : !currentEnabled;
    
    this.setEnvironmentVar(CHECKPOINT_ENV_VARS.WRITE_HOOKS, newEnabled);
    
    return this.getCurrentState();
  }

  /**
   * Reset to default state (from session initialization)
   */
  resetToDefaults(): CheckpointState {
    if (!this.sessionInfo) {
      // If no session, reset to original environment defaults
      const originalDefaults = this.defaultState;
      this.setEnvironmentVar(CHECKPOINT_ENV_VARS.GLOBAL, originalDefaults.globalEnabled);
      this.setEnvironmentVar(CHECKPOINT_ENV_VARS.EDIT_HOOKS, originalDefaults.editHooks);
      this.setEnvironmentVar(CHECKPOINT_ENV_VARS.TASK_HOOKS, originalDefaults.taskHooks);
      this.setEnvironmentVar(CHECKPOINT_ENV_VARS.SESSION_HOOKS, originalDefaults.sessionHooks);
      this.setEnvironmentVar(CHECKPOINT_ENV_VARS.WRITE_HOOKS, originalDefaults.writeHooks);
    } else {
      // Reset to session default state
      const defaults = this.sessionInfo.defaultState;
      this.setEnvironmentVar(CHECKPOINT_ENV_VARS.GLOBAL, defaults.globalEnabled);
      this.setEnvironmentVar(CHECKPOINT_ENV_VARS.EDIT_HOOKS, defaults.editHooks);
      this.setEnvironmentVar(CHECKPOINT_ENV_VARS.TASK_HOOKS, defaults.taskHooks);
      this.setEnvironmentVar(CHECKPOINT_ENV_VARS.SESSION_HOOKS, defaults.sessionHooks);
      this.setEnvironmentVar(CHECKPOINT_ENV_VARS.WRITE_HOOKS, defaults.writeHooks);
    }
    
    return this.getCurrentState();
  }

  /**
   * Get current checkpoint state
   */
  getCurrentState(): CheckpointState {
    return this.readEnvironmentState();
  }

  /**
   * Get session information
   */
  getSessionInfo(): CheckpointSessionInfo | null {
    return this.sessionInfo;
  }

  /**
   * Check if a specific hook type should execute
   */
  shouldExecuteHook(hookType: string): boolean {
    const state = this.getCurrentState();
    
    // Check global state first
    if (!state.globalEnabled) {
      return false;
    }
    
    // Check specific hook type
    const hookCategory = HOOK_TYPE_MAPPING[hookType as keyof typeof HOOK_TYPE_MAPPING];
    if (!hookCategory) {
      // Unknown hook type, default to global state
      return state.globalEnabled;
    }
    
    return state[hookCategory as keyof CheckpointState] as boolean;
  }

  /**
   * Get list of currently active hook types
   */
  getActiveHookTypes(): string[] {
    const state = this.getCurrentState();
    const activeHooks: string[] = [];
    
    if (!state.globalEnabled) {
      return activeHooks;
    }
    
    if (state.editHooks) {
      activeHooks.push('PreToolUse:Edit', 'PostToolUse:Edit');
    }
    
    if (state.writeHooks) {
      activeHooks.push('PreToolUse:Write');
    }
    
    if (state.taskHooks) {
      activeHooks.push('UserPromptSubmit');
    }
    
    if (state.sessionHooks) {
      activeHooks.push('Stop');
    }
    
    return activeHooks;
  }

  /**
   * Get environment variables that would need to be set for current state
   */
  getEnvironmentVariables(): Record<string, string> {
    const state = this.getCurrentState();
    
    return {
      [CHECKPOINT_ENV_VARS.GLOBAL]: state.globalEnabled ? 'true' : 'false',
      [CHECKPOINT_ENV_VARS.EDIT_HOOKS]: state.editHooks ? 'true' : 'false',
      [CHECKPOINT_ENV_VARS.TASK_HOOKS]: state.taskHooks ? 'true' : 'false',
      [CHECKPOINT_ENV_VARS.SESSION_HOOKS]: state.sessionHooks ? 'true' : 'false',
      [CHECKPOINT_ENV_VARS.WRITE_HOOKS]: state.writeHooks ? 'true' : 'false',
    };
  }
}

// Export singleton instance
export const checkpointStateManager = new CheckpointStateManager();