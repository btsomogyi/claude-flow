# Checkpoint MCP Commands Usage Examples

## Overview

The checkpoint MCP commands provide session-scoped control over Claude Flow's checkpoint functionality. These commands use environment variables to toggle checkpoint behavior without modifying persistent configuration files.

## Available Commands

### Global Controls

#### Enable All Checkpoints
```bash
/checkpoints:on
```
**Response:**
```json
{
  "success": true,
  "enabled": true,
  "sessionId": "mcp-session-1754938203",
  "message": "All checkpoints enabled for current session",
  "state": {
    "globalEnabled": true,
    "editHooks": true,
    "taskHooks": true,
    "sessionHooks": true,
    "writeHooks": true
  },
  "activeHooks": [
    "PreToolUse:Edit",
    "PostToolUse:Edit", 
    "PreToolUse:Write",
    "UserPromptSubmit",
    "Stop"
  ],
  "timestamp": "2025-08-11T19:15:03.456Z"
}
```

#### Disable All Checkpoints
```bash
/checkpoints:off
```
**Response:**
```json
{
  "success": true,
  "enabled": false,
  "sessionId": "mcp-session-1754938203",
  "message": "All checkpoints disabled for current session",
  "state": {
    "globalEnabled": false,
    "editHooks": true,
    "taskHooks": true,
    "sessionHooks": true,
    "writeHooks": true
  },
  "activeHooks": [],
  "timestamp": "2025-08-11T19:15:10.789Z"
}
```

### Status and Configuration

#### Check Current Status
```bash
/checkpoints:status
```
**Response:**
```json
{
  "success": true,
  "sessionId": "mcp-session-1754938203",
  "sessionInfo": {
    "sessionId": "mcp-session-1754938203",
    "startTime": "2025-08-11T19:10:00.000Z",
    "defaultState": {
      "globalEnabled": true,
      "editHooks": true,
      "taskHooks": true,
      "sessionHooks": true,
      "writeHooks": true
    },
    "currentState": {
      "globalEnabled": true,
      "editHooks": false,
      "taskHooks": true,
      "sessionHooks": true,
      "writeHooks": true
    }
  },
  "currentState": {
    "globalEnabled": true,
    "editHooks": false,
    "taskHooks": true,
    "sessionHooks": true,
    "writeHooks": true
  },
  "activeHooks": [
    "PreToolUse:Write",
    "UserPromptSubmit", 
    "Stop"
  ],
  "environmentVariables": {
    "CLAUDE_CHECKPOINTS_ENABLED": "true",
    "CLAUDE_CHECKPOINTS_EDIT_HOOKS": "false",
    "CLAUDE_CHECKPOINTS_TASK_HOOKS": "true",
    "CLAUDE_CHECKPOINTS_SESSION_HOOKS": "true",
    "CLAUDE_CHECKPOINTS_WRITE_HOOKS": "true"
  },
  "summary": {
    "globalEnabled": true,
    "totalHookTypes": 5,
    "activeHookTypes": 3,
    "editHooksEnabled": false,
    "taskHooksEnabled": true,
    "sessionHooksEnabled": true,
    "writeHooksEnabled": true
  },
  "timestamp": "2025-08-11T19:15:20.123Z"
}
```

#### Get Full Configuration
```bash
/checkpoints:config
```
**Response:**
```json
{
  "success": true,
  "sessionId": "mcp-session-1754938203",
  "sessionInfo": { "..." },
  "currentState": { "..." },
  "environmentVariables": { "..." },
  "activeHooks": ["..."],
  "hookTypeMapping": {
    "PreToolUse:Edit": "editHooks",
    "PostToolUse:Edit": "editHooks",
    "PreToolUse:Write": "writeHooks",
    "UserPromptSubmit": "taskHooks", 
    "Stop": "sessionHooks"
  },
  "usage": {
    "description": "Use environment variables in .claude/settings.json hook commands",
    "example": "[ \"${CLAUDE_CHECKPOINTS_ENABLED:-true}\" = \"true\" ] && [ \"${CLAUDE_CHECKPOINTS_EDIT_HOOKS:-true}\" = \"true\" ]",
    "commands": [
      "/checkpoints:on - Enable all checkpoints",
      "/checkpoints:off - Disable all checkpoints",
      "/checkpoints:toggle:edit - Toggle edit hooks",
      "/checkpoints:toggle:task - Toggle task hooks",
      "/checkpoints:toggle:session - Toggle session hooks", 
      "/checkpoints:toggle:write - Toggle write hooks"
    ]
  },
  "timestamp": "2025-08-11T19:15:30.456Z"
}
```

### Granular Controls

#### Toggle Edit Hooks
```bash
# Toggle current state
/checkpoints:toggle:edit

# Set specific state
/checkpoints:toggle:edit --enabled=false
```
**Response:**
```json
{
  "success": true,
  "sessionId": "mcp-session-1754938203",
  "hookType": "edit",
  "editHooksEnabled": false,
  "affectedHooks": [
    "PreToolUse:Edit",
    "PostToolUse:Edit"
  ],
  "message": "Edit hooks disabled for current session",
  "activeHooks": [
    "PreToolUse:Write",
    "UserPromptSubmit",
    "Stop"
  ],
  "timestamp": "2025-08-11T19:15:40.789Z"
}
```

#### Toggle Task Hooks
```bash
# Toggle current state
/checkpoints:toggle:task

# Set specific state  
/checkpoints:toggle:task --enabled=true
```
**Response:**
```json
{
  "success": true,
  "sessionId": "mcp-session-1754938203",
  "hookType": "task",
  "taskHooksEnabled": true,
  "affectedHooks": [
    "UserPromptSubmit"
  ],
  "message": "Task hooks enabled for current session",
  "activeHooks": [
    "PreToolUse:Write",
    "UserPromptSubmit",
    "Stop"
  ],
  "timestamp": "2025-08-11T19:15:50.123Z"
}
```

#### Toggle Session Hooks
```bash
/checkpoints:toggle:session --enabled=false
```
**Response:**
```json
{
  "success": true,
  "sessionId": "mcp-session-1754938203",
  "hookType": "session",
  "sessionHooksEnabled": false,
  "affectedHooks": [
    "Stop"
  ],
  "message": "Session hooks disabled for current session",
  "activeHooks": [
    "PreToolUse:Write",
    "UserPromptSubmit"
  ],
  "timestamp": "2025-08-11T19:16:00.456Z"
}
```

#### Toggle Write Hooks
```bash
/checkpoints:toggle:write
```
**Response:**
```json
{
  "success": true,
  "sessionId": "mcp-session-1754938203",
  "hookType": "write",
  "writeHooksEnabled": false,
  "affectedHooks": [
    "PreToolUse:Write"
  ],
  "message": "Write hooks disabled for current session",
  "activeHooks": [
    "UserPromptSubmit"
  ],
  "timestamp": "2025-08-11T19:16:10.789Z"
}
```

### Reset Command

#### Reset to Defaults
```bash
/checkpoints:reset
```
**Response:**
```json
{
  "success": true,
  "sessionId": "mcp-session-1754938203",
  "message": "Checkpoint state reset to session defaults",
  "state": {
    "globalEnabled": true,
    "editHooks": true,
    "taskHooks": true,
    "sessionHooks": true,
    "writeHooks": true
  },
  "activeHooks": [
    "PreToolUse:Edit",
    "PostToolUse:Edit",
    "PreToolUse:Write", 
    "UserPromptSubmit",
    "Stop"
  ],
  "timestamp": "2025-08-11T19:16:20.123Z"
}
```

### Utility Commands

#### Check if Hook Should Execute
```bash
/checkpoints:should-execute --hookType="PreToolUse:Edit"
```
**Response:**
```json
{
  "success": true,
  "hookType": "PreToolUse:Edit",
  "shouldExecute": false,
  "globalEnabled": true,
  "sessionId": "mcp-session-1754938203",
  "timestamp": "2025-08-11T19:16:30.456Z"
}
```

## Integration with .claude/settings.json

To use these MCP commands effectively, your `.claude/settings.json` hook commands need to check the environment variables:

### Example Hook Command Structure

```json
{
  "version": "1.0.0",
  "hooks": {
    "PreToolUse:Edit": {
      "enabled": true,
      "command": "[ \"${CLAUDE_CHECKPOINTS_ENABLED:-true}\" = \"true\" ] && [ \"${CLAUDE_CHECKPOINTS_EDIT_HOOKS:-true}\" = \"true\" ] && { # Original checkpoint command here } || echo \"ℹ️  Edit checkpoints disabled\""
    },
    
    "UserPromptSubmit": {
      "enabled": true, 
      "command": "[ \"${CLAUDE_CHECKPOINTS_ENABLED:-true}\" = \"true\" ] && [ \"${CLAUDE_CHECKPOINTS_TASK_HOOKS:-true}\" = \"true\" ] && { # Original checkpoint command here } || echo \"ℹ️  Task checkpoints disabled\""
    }
  }
}
```

## Environment Variables

The system uses these environment variables:

- `CLAUDE_CHECKPOINTS_ENABLED` - Global checkpoint control
- `CLAUDE_CHECKPOINTS_EDIT_HOOKS` - Controls PreToolUse:Edit and PostToolUse:Edit
- `CLAUDE_CHECKPOINTS_WRITE_HOOKS` - Controls PreToolUse:Write
- `CLAUDE_CHECKPOINTS_TASK_HOOKS` - Controls UserPromptSubmit
- `CLAUDE_CHECKPOINTS_SESSION_HOOKS` - Controls Stop

All variables default to `true` if not set, maintaining backward compatibility.

## Workflow Examples

### Disable Checkpoints for Quick Edits
```bash
# Disable all checkpoints for fast iterations
/checkpoints:off

# Do your work without checkpoint overhead...

# Re-enable when done
/checkpoints:on
```

### Keep Task Checkpoints, Disable File Checkpoints
```bash
# Disable file-related checkpoints but keep task tracking
/checkpoints:toggle:edit --enabled=false
/checkpoints:toggle:write --enabled=false

# Task checkpoints will still be created on UserPromptSubmit
# Session summary will still be created on Stop
```

### Temporary Disable During Testing
```bash
# Check current status
/checkpoints:status

# Disable all for testing
/checkpoints:off

# Run tests...

# Reset to original state
/checkpoints:reset
```

## Error Handling

Commands return error information if something goes wrong:

```json
{
  "success": false,
  "error": "Hook type 'InvalidHook' not recognized",
  "sessionId": "mcp-session-1754938203",
  "timestamp": "2025-08-11T19:17:00.000Z"
}
```

## Session Behavior

- Commands only affect the current Claude session
- New sessions start with default environment variable values
- No persistent changes are made to configuration files
- Environment variables are set only for the current process