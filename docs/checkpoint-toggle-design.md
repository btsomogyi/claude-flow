# Checkpoint Toggle Design Document

## Overview

This document outlines the design and implementation approach for providing session-scoped MCP commands to toggle the hook-based checkpoint functionality within a single Claude session.

## Problem Statement

Users need the ability to dynamically enable/disable checkpoint functionality during a Claude session without modifying persistent configuration files. The toggle should:
- Only affect the current session
- Reset to default configuration for new sessions
- Provide granular control over different checkpoint types
- Use MCP server commands for control

## Current Architecture Analysis

### Existing Checkpoint System

The checkpoint system uses Claude Code's hook mechanism defined in `.claude/settings.json`:

```json
{
  "version": "1.0.0",
  "hooks": {
    "PreToolUse:Edit": {
      "enabled": true,
      "command": "..."
    },
    "PostToolUse:Edit": {
      "enabled": true,
      "command": "..."
    },
    "PreToolUse:Write": {
      "enabled": true,
      "command": "..."
    },
    "UserPromptSubmit": {
      "enabled": true,
      "command": "..."
    },
    "Stop": {
      "enabled": true,
      "command": "..."
    }
  }
}
```

### Hook Types

1. **PreToolUse:Edit** - Creates checkpoint before file edits
2. **PostToolUse:Edit** - Creates checkpoint after file edits
3. **PreToolUse:Write** - Creates checkpoint before file creation
4. **UserPromptSubmit** - Creates task checkpoint on user prompts
5. **Stop** - Creates session summary checkpoint

### MCP Server Architecture

The MCP server (src/mcp/server.ts) provides:
- Tool registry for registering new MCP commands
- Session management with context
- JSON-RPC 2.0 protocol handling
- Built-in tools: system/info, system/health, tools/list, tools/schema

## Design Solution

### Session-Scoped Toggle Architecture

Instead of modifying persistent configuration files, implement session-scoped toggles using:

1. **Runtime State Management**
   - Store checkpoint toggle state in session memory
   - Override default hook behavior based on session state
   - Reset to defaults on new session initialization

2. **MCP Command Interface**
   - Implement MCP tools for checkpoint control
   - Commands affect only current session
   - No persistence to disk

3. **Hook Interception**
   - Intercept hook execution based on session state
   - Skip checkpoint commands when disabled
   - Maintain hook registration but control execution

### MCP Command Specification

#### Core Commands

```typescript
// Enable all checkpoint functionality for current session
/checkpoints:on
Input: {}
Output: { enabled: true, hooks: [...enabled_hooks] }

// Disable all checkpoint functionality for current session
/checkpoints:off
Input: {}
Output: { enabled: false, hooks: [...disabled_hooks] }

// Show current checkpoint status for session
/checkpoints:status
Input: {}
Output: { 
  session_id: string,
  default_enabled: boolean,
  current_state: {
    edit_hooks: boolean,
    task_hooks: boolean,
    session_hooks: boolean
  },
  active_hooks: [...hook_names]
}

// Reset to default configuration
/checkpoints:reset
Input: {}
Output: { reset: true, state: {...default_state} }
```

#### Granular Control Commands

```typescript
// Toggle edit-related hooks (PreToolUse:Edit, PostToolUse:Edit, PreToolUse:Write)
/checkpoints:toggle:edit
Input: { enabled?: boolean }
Output: { edit_hooks_enabled: boolean }

// Toggle task-related hooks (UserPromptSubmit)
/checkpoints:toggle:task
Input: { enabled?: boolean }
Output: { task_hooks_enabled: boolean }

// Toggle session-related hooks (Stop)
/checkpoints:toggle:session
Input: { enabled?: boolean }
Output: { session_hooks_enabled: boolean }
```

### Implementation Architecture

#### 1. Session State Manager

```typescript
interface CheckpointSessionState {
  sessionId: string;
  defaultEnabled: boolean;
  overrides: {
    editHooks: boolean | null;
    taskHooks: boolean | null;
    sessionHooks: boolean | null;
    globalOverride: boolean | null;
  };
}

class CheckpointStateManager {
  private sessionStates: Map<string, CheckpointSessionState> = new Map();
  
  getSessionState(sessionId: string): CheckpointSessionState
  setGlobalOverride(sessionId: string, enabled: boolean): void
  setHookTypeOverride(sessionId: string, type: string, enabled: boolean): void
  shouldExecuteHook(sessionId: string, hookType: string): boolean
  resetSession(sessionId: string): void
}
```

#### 2. Hook Execution Interceptor

```typescript
interface HookInterceptor {
  // Check if hook should execute based on session state
  shouldExecuteHook(sessionId: string, hookType: string): boolean;
  
  // Wrap existing hook commands with conditional execution
  wrapHookCommand(originalCommand: string, hookType: string): string;
}
```

#### 3. MCP Tools Implementation

```typescript
// Register checkpoint control tools in MCP server
const checkpointTools: MCPTool[] = [
  {
    name: 'checkpoints/on',
    description: 'Enable all checkpoint functionality for current session',
    inputSchema: { type: 'object', properties: {} },
    handler: async (input, context) => {
      const sessionId = context.sessionId;
      checkpointStateManager.setGlobalOverride(sessionId, true);
      return { enabled: true, sessionId };
    }
  },
  {
    name: 'checkpoints/off',
    description: 'Disable all checkpoint functionality for current session',
    inputSchema: { type: 'object', properties: {} },
    handler: async (input, context) => {
      const sessionId = context.sessionId;
      checkpointStateManager.setGlobalOverride(sessionId, false);
      return { enabled: false, sessionId };
    }
  },
  // ... additional tools
];
```

### State Management Flow

#### Session Initialization
1. New session starts with default checkpoint configuration
2. Read environment variables or .claude/settings.json for defaults
3. Initialize session state with defaults
4. No overrides initially applied

#### MCP Command Processing
1. MCP command received (e.g., `/checkpoints:off`)
2. Extract session ID from context
3. Update session state in CheckpointStateManager
4. Return confirmation to user
5. Subsequent hooks check session state before executing

#### Hook Execution Decision Tree
```
Hook triggered (e.g., PreToolUse:Edit)
  ↓
Get session ID
  ↓
Check CheckpointStateManager.shouldExecuteHook(sessionId, hookType)
  ↓
If globalOverride exists: use globalOverride
Else if hookTypeOverride exists: use hookTypeOverride  
Else: use default configuration
  ↓
Execute or skip hook command accordingly
```

### Environment Variable Integration

Support environment variables for default session behavior:

```bash
# Default checkpoint state for new sessions
export CLAUDE_CHECKPOINTS_ENABLED=true

# Granular defaults
export CLAUDE_CHECKPOINTS_EDIT_HOOKS=true
export CLAUDE_CHECKPOINTS_TASK_HOOKS=true
export CLAUDE_CHECKPOINTS_SESSION_HOOKS=true
```

### Implementation Files

#### New Files to Create

1. **src/services/checkpoint-state-manager.ts**
   - Session-scoped state management
   - Hook execution decision logic

2. **src/mcp/checkpoint-tools.ts**
   - MCP tool implementations for checkpoint control
   - Command handlers and schemas

3. **src/services/hook-interceptor.ts**
   - Hook execution interception logic
   - Command wrapping utilities

#### Modified Files

1. **src/mcp/server.ts**
   - Register checkpoint control tools
   - Initialize checkpoint state manager

2. **src/services/agentic-flow-hooks/hook-manager.ts**
   - Integrate with session state checking
   - Add conditional execution logic

### Usage Examples

#### Basic Toggle Commands
```typescript
// User in Claude session types:
/checkpoints:off
// Response: { "enabled": false, "message": "Checkpoints disabled for current session" }

// Continue working... no checkpoints created

/checkpoints:on  
// Response: { "enabled": true, "message": "Checkpoints enabled for current session" }

// Continue working... checkpoints resume
```

#### Granular Control
```typescript
// Disable only edit hooks, keep task checkpoints
/checkpoints:toggle:edit
// Input: { "enabled": false }
// Response: { "edit_hooks_enabled": false, "task_hooks_enabled": true }

// Check current status
/checkpoints:status
// Response: {
//   "session_id": "session-12345",
//   "current_state": {
//     "edit_hooks": false,
//     "task_hooks": true, 
//     "session_hooks": true
//   }
// }
```

### Benefits

1. **Non-Persistent** - No modification of configuration files
2. **Session-Scoped** - Settings only affect current session
3. **Granular Control** - Fine-grained control over hook types
4. **Backward Compatible** - Doesn't break existing checkpoint functionality
5. **Environment Variable Support** - Configurable defaults
6. **MCP Native** - Leverages existing MCP server infrastructure

### Future Enhancements

1. **Hook Pattern Matching** - Toggle specific hooks by pattern
2. **Conditional Toggles** - Toggle based on file types or paths
3. **Temporary Toggles** - Auto-reset after time period
4. **Checkpoint History** - View session checkpoint history via MCP

## Conclusion

This design provides a clean, session-scoped mechanism for controlling checkpoint functionality via MCP commands without persistence concerns. The architecture leverages existing systems and maintains compatibility while adding the requested toggle capability.