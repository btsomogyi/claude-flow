/**
 * MCP Tools for Checkpoint Control
 * 
 * Provides MCP commands to toggle checkpoint functionality within a session.
 * Commands are session-scoped and use environment variables for state management.
 */

import type { MCPTool, MCPContext } from '../utils/types.js';
import type { ILogger } from '../core/logger.js';
import { 
  checkpointStateManager, 
  CheckpointState, 
  CheckpointSessionInfo 
} from '../services/checkpoint-state-manager.js';

export interface CheckpointToolContext extends MCPContext {
  sessionId?: string;
}

/**
 * Create all checkpoint control MCP tools
 */
export function createCheckpointTools(logger: ILogger): MCPTool[] {
  return [
    // Global checkpoint controls
    createCheckpointsOnTool(logger),
    createCheckpointsOffTool(logger),
    createCheckpointsStatusTool(logger),
    createCheckpointsResetTool(logger),
    
    // Granular hook type controls
    createCheckpointsToggleEditTool(logger),
    createCheckpointsToggleTaskTool(logger),  
    createCheckpointsToggleSessionTool(logger),
    createCheckpointsToggleWriteTool(logger),
    
    // Utility tools
    createCheckpointsConfigTool(logger),
    createCheckpointsShouldExecuteTool(logger),
  ];
}

/**
 * Enable all checkpoint functionality
 */
function createCheckpointsOnTool(logger: ILogger): MCPTool {
  return {
    name: 'checkpoints/on',
    description: 'Enable all checkpoint functionality for the current session',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    handler: async (input: unknown, context?: CheckpointToolContext) => {
      logger.info('Enabling all checkpoints for session', { sessionId: context?.sessionId });
      
      // Initialize session if needed
      if (context?.sessionId && !checkpointStateManager.getSessionInfo()) {
        checkpointStateManager.initializeSession(context.sessionId);
      }
      
      const state = checkpointStateManager.enableAll();
      const activeHooks = checkpointStateManager.getActiveHookTypes();
      
      logger.info('All checkpoints enabled', { 
        sessionId: context?.sessionId, 
        activeHooks: activeHooks.length 
      });
      
      return {
        success: true,
        enabled: true,
        sessionId: context?.sessionId || 'unknown',
        message: 'All checkpoints enabled for current session',
        state,
        activeHooks,
        timestamp: new Date().toISOString(),
      };
    },
  };
}

/**
 * Disable all checkpoint functionality  
 */
function createCheckpointsOffTool(logger: ILogger): MCPTool {
  return {
    name: 'checkpoints/off',
    description: 'Disable all checkpoint functionality for the current session',
    inputSchema: {
      type: 'object', 
      properties: {},
      additionalProperties: false,
    },
    handler: async (input: unknown, context?: CheckpointToolContext) => {
      logger.info('Disabling all checkpoints for session', { sessionId: context?.sessionId });
      
      // Initialize session if needed
      if (context?.sessionId && !checkpointStateManager.getSessionInfo()) {
        checkpointStateManager.initializeSession(context.sessionId);
      }
      
      const state = checkpointStateManager.disableAll();
      
      logger.info('All checkpoints disabled', { sessionId: context?.sessionId });
      
      return {
        success: true,
        enabled: false,
        sessionId: context?.sessionId || 'unknown',
        message: 'All checkpoints disabled for current session',
        state,
        activeHooks: [],
        timestamp: new Date().toISOString(),
      };
    },
  };
}

/**
 * Get current checkpoint status
 */
function createCheckpointsStatusTool(logger: ILogger): MCPTool {
  return {
    name: 'checkpoints/status',
    description: 'Get current checkpoint status for the session',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    handler: async (input: unknown, context?: CheckpointToolContext) => {
      const sessionInfo = checkpointStateManager.getSessionInfo();
      const currentState = checkpointStateManager.getCurrentState();
      const activeHooks = checkpointStateManager.getActiveHookTypes();
      const envVars = checkpointStateManager.getEnvironmentVariables();
      
      return {
        success: true,
        sessionId: context?.sessionId || sessionInfo?.sessionId || 'unknown',
        sessionInfo,
        currentState,
        activeHooks,
        environmentVariables: envVars,
        summary: {
          globalEnabled: currentState.globalEnabled,
          totalHookTypes: 5,
          activeHookTypes: activeHooks.length,
          editHooksEnabled: currentState.editHooks,
          taskHooksEnabled: currentState.taskHooks,
          sessionHooksEnabled: currentState.sessionHooks,
          writeHooksEnabled: currentState.writeHooks,
        },
        timestamp: new Date().toISOString(),
      };
    },
  };
}

/**
 * Reset checkpoint state to session defaults
 */
function createCheckpointsResetTool(logger: ILogger): MCPTool {
  return {
    name: 'checkpoints/reset',
    description: 'Reset checkpoint state to session defaults',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    handler: async (input: unknown, context?: CheckpointToolContext) => {
      logger.info('Resetting checkpoint state to defaults', { sessionId: context?.sessionId });
      
      const state = checkpointStateManager.resetToDefaults();
      const activeHooks = checkpointStateManager.getActiveHookTypes();
      
      return {
        success: true,
        sessionId: context?.sessionId || 'unknown',
        message: 'Checkpoint state reset to session defaults',
        state,
        activeHooks,
        timestamp: new Date().toISOString(),
      };
    },
  };
}

/**
 * Toggle edit hooks (PreToolUse:Edit, PostToolUse:Edit)
 */
function createCheckpointsToggleEditTool(logger: ILogger): MCPTool {
  return {
    name: 'checkpoints/toggle/edit',
    description: 'Toggle edit checkpoint hooks (PreToolUse:Edit, PostToolUse:Edit)',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          description: 'Set specific enabled state, or toggle if not provided',
        },
      },
      additionalProperties: false,
    },
    handler: async (input: any, context?: CheckpointToolContext) => {
      const enabled = input?.enabled;
      
      logger.info('Toggling edit hooks', { 
        sessionId: context?.sessionId, 
        enabled 
      });
      
      const state = checkpointStateManager.toggleEditHooks(enabled);
      const activeHooks = checkpointStateManager.getActiveHookTypes();
      
      return {
        success: true,
        sessionId: context?.sessionId || 'unknown',
        hookType: 'edit',
        editHooksEnabled: state.editHooks,
        affectedHooks: ['PreToolUse:Edit', 'PostToolUse:Edit'],
        message: `Edit hooks ${state.editHooks ? 'enabled' : 'disabled'} for current session`,
        activeHooks,
        timestamp: new Date().toISOString(),
      };
    },
  };
}

/**
 * Toggle task hooks (UserPromptSubmit)
 */
function createCheckpointsToggleTaskTool(logger: ILogger): MCPTool {
  return {
    name: 'checkpoints/toggle/task',
    description: 'Toggle task checkpoint hooks (UserPromptSubmit)',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          description: 'Set specific enabled state, or toggle if not provided',
        },
      },
      additionalProperties: false,
    },
    handler: async (input: any, context?: CheckpointToolContext) => {
      const enabled = input?.enabled;
      
      logger.info('Toggling task hooks', { 
        sessionId: context?.sessionId, 
        enabled 
      });
      
      const state = checkpointStateManager.toggleTaskHooks(enabled);
      const activeHooks = checkpointStateManager.getActiveHookTypes();
      
      return {
        success: true,
        sessionId: context?.sessionId || 'unknown',
        hookType: 'task',
        taskHooksEnabled: state.taskHooks,
        affectedHooks: ['UserPromptSubmit'],
        message: `Task hooks ${state.taskHooks ? 'enabled' : 'disabled'} for current session`,
        activeHooks,
        timestamp: new Date().toISOString(),
      };
    },
  };
}

/**
 * Toggle session hooks (Stop)
 */
function createCheckpointsToggleSessionTool(logger: ILogger): MCPTool {
  return {
    name: 'checkpoints/toggle/session',
    description: 'Toggle session checkpoint hooks (Stop)',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          description: 'Set specific enabled state, or toggle if not provided',
        },
      },
      additionalProperties: false,
    },
    handler: async (input: any, context?: CheckpointToolContext) => {
      const enabled = input?.enabled;
      
      logger.info('Toggling session hooks', { 
        sessionId: context?.sessionId, 
        enabled 
      });
      
      const state = checkpointStateManager.toggleSessionHooks(enabled);
      const activeHooks = checkpointStateManager.getActiveHookTypes();
      
      return {
        success: true,
        sessionId: context?.sessionId || 'unknown',
        hookType: 'session',
        sessionHooksEnabled: state.sessionHooks,
        affectedHooks: ['Stop'],
        message: `Session hooks ${state.sessionHooks ? 'enabled' : 'disabled'} for current session`,
        activeHooks,
        timestamp: new Date().toISOString(),
      };
    },
  };
}

/**
 * Toggle write hooks (PreToolUse:Write)
 */
function createCheckpointsToggleWriteTool(logger: ILogger): MCPTool {
  return {
    name: 'checkpoints/toggle/write',
    description: 'Toggle write checkpoint hooks (PreToolUse:Write)',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          description: 'Set specific enabled state, or toggle if not provided',
        },
      },
      additionalProperties: false,
    },
    handler: async (input: any, context?: CheckpointToolContext) => {
      const enabled = input?.enabled;
      
      logger.info('Toggling write hooks', { 
        sessionId: context?.sessionId, 
        enabled 
      });
      
      const state = checkpointStateManager.toggleWriteHooks(enabled);
      const activeHooks = checkpointStateManager.getActiveHookTypes();
      
      return {
        success: true,
        sessionId: context?.sessionId || 'unknown',
        hookType: 'write',
        writeHooksEnabled: state.writeHooks,
        affectedHooks: ['PreToolUse:Write'],
        message: `Write hooks ${state.writeHooks ? 'enabled' : 'disabled'} for current session`,
        activeHooks,
        timestamp: new Date().toISOString(),
      };
    },
  };
}

/**
 * Get full checkpoint configuration
 */
function createCheckpointsConfigTool(logger: ILogger): MCPTool {
  return {
    name: 'checkpoints/config',
    description: 'Get full checkpoint configuration and environment variables',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    handler: async (input: unknown, context?: CheckpointToolContext) => {
      const sessionInfo = checkpointStateManager.getSessionInfo();
      const currentState = checkpointStateManager.getCurrentState();
      const envVars = checkpointStateManager.getEnvironmentVariables();
      const activeHooks = checkpointStateManager.getActiveHookTypes();
      
      return {
        success: true,
        sessionId: context?.sessionId || 'unknown',
        sessionInfo,
        currentState,
        environmentVariables: envVars,
        activeHooks,
        hookTypeMapping: {
          'PreToolUse:Edit': 'editHooks',
          'PostToolUse:Edit': 'editHooks',
          'PreToolUse:Write': 'writeHooks', 
          'UserPromptSubmit': 'taskHooks',
          'Stop': 'sessionHooks',
        },
        usage: {
          description: 'Use environment variables in .claude/settings.json hook commands',
          example: '[ "${CLAUDE_CHECKPOINTS_ENABLED:-true}" = "true" ] && [ "${CLAUDE_CHECKPOINTS_EDIT_HOOKS:-true}" = "true" ]',
          commands: [
            '/checkpoints:on - Enable all checkpoints',
            '/checkpoints:off - Disable all checkpoints', 
            '/checkpoints:toggle:edit - Toggle edit hooks',
            '/checkpoints:toggle:task - Toggle task hooks',
            '/checkpoints:toggle:session - Toggle session hooks',
            '/checkpoints:toggle:write - Toggle write hooks',
          ],
        },
        timestamp: new Date().toISOString(),
      };
    },
  };
}

/**
 * Check if a specific hook should execute (utility for hook commands)
 */
function createCheckpointsShouldExecuteTool(logger: ILogger): MCPTool {
  return {
    name: 'checkpoints/should-execute',
    description: 'Check if a specific checkpoint hook should execute (utility tool)',
    inputSchema: {
      type: 'object',
      properties: {
        hookType: {
          type: 'string',
          description: 'Hook type to check (e.g., PreToolUse:Edit, UserPromptSubmit)',
        },
      },
      required: ['hookType'],
      additionalProperties: false,
    },
    handler: async (input: any, context?: CheckpointToolContext) => {
      const hookType = input?.hookType;
      
      if (!hookType) {
        throw new Error('hookType is required');
      }
      
      const shouldExecute = checkpointStateManager.shouldExecuteHook(hookType);
      const currentState = checkpointStateManager.getCurrentState();
      
      return {
        success: true,
        hookType,
        shouldExecute,
        globalEnabled: currentState.globalEnabled,
        sessionId: context?.sessionId || 'unknown',
        timestamp: new Date().toISOString(),
      };
    },
  };
}