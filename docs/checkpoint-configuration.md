# Checkpoint Configuration Guide

## Overview

Claude Flow provides automatic git checkpointing to help you track and rollback changes during development sessions. This feature creates git commits and tags at key points during your work, making it easy to recover from mistakes or review changes.

## Disabling Checkpoints

While checkpoints are useful for tracking changes, you may want to disable them in certain scenarios:
- When working in a CI/CD environment
- When you prefer manual git management
- When working on sensitive projects where automatic commits are not desired
- To reduce git history clutter during experimentation

### Method 1: CLI Flag (Recommended)

Use the `--no-checkpoints` flag when initializing Claude Flow:

```bash
npx claude-flow init --no-checkpoints
```

This will:
- Set `CLAUDE_FLOW_CHECKPOINTS_ENABLED=false` in `.claude/settings.json`
- Configure all checkpoint hooks to skip execution
- Display a warning that checkpoints are disabled

### Method 2: Environment Variable

Set the environment variable before running Claude commands:

```bash
export CLAUDE_FLOW_CHECKPOINTS_ENABLED=false
```

Or in your shell configuration file (`.bashrc`, `.zshrc`, etc.):

```bash
# Disable Claude Flow checkpoints globally
export CLAUDE_FLOW_CHECKPOINTS_ENABLED=false
```

### Method 3: Manual Configuration

Edit `.claude/settings.json` directly:

```json
{
  "env": {
    "CLAUDE_FLOW_CHECKPOINTS_ENABLED": "false",
    // ... other settings
  }
}
```

## How Checkpoints Work

When enabled (default), Claude Flow creates checkpoints at these events:

### 1. Pre-Edit Checkpoints
- Created before modifying any file
- Creates a git branch `checkpoint/pre-edit-YYYYMMDD-HHMMSS`
- Stores file metadata in `.claude/checkpoints/`

### 2. Post-Edit Checkpoints
- Created after modifying a file
- Commits changes with descriptive message
- Creates git tag `checkpoint-YYYYMMDD-HHMMSS`
- Records diff statistics

### 3. Task Checkpoints
- Created when starting a new task
- Commits all current changes
- Names checkpoint as `task-YYYYMMDD-HHMMSS`
- Optionally creates GitHub release (with gh CLI)

### 4. Session End Checkpoints
- Created when Claude session ends
- Generates session summary in `.claude/checkpoints/summary-*.md`
- Creates final tag `session-end-YYYYMMDD-HHMMSS`
- Includes rollback instructions

## Configuration Options

### Settings.json Environment Variables

```json
{
  "env": {
    "CLAUDE_FLOW_CHECKPOINTS_ENABLED": "true",  // Enable/disable all checkpoints
    "CLAUDE_FLOW_AUTO_COMMIT": "false",         // Auto-commit changes (separate from checkpoints)
    "CLAUDE_FLOW_AUTO_PUSH": "false",           // Auto-push to remote
    "CREATE_GH_RELEASE": "true"                 // Create GitHub releases for checkpoints
  }
}
```

### Checkpoint Storage

Checkpoint metadata is stored in:
- `.claude/checkpoints/*.json` - Checkpoint metadata files
- `.claude/checkpoints/summary-*.md` - Session summaries
- Git commits with 🔖 emoji prefix
- Git tags with `checkpoint-*` or `session-end-*` prefix
- GitHub releases (optional, requires gh CLI)

## Rollback Instructions

### When Checkpoints are Enabled

To rollback to a previous checkpoint:

```bash
# List all checkpoints
git tag -l 'checkpoint-*' | sort -r

# View checkpoint details
git show checkpoint-20250807-143022

# Rollback to a checkpoint (safe - creates new branch)
git checkout checkpoint-20250807-143022

# Reset to checkpoint (destructive - loses uncommitted changes)
git reset --hard checkpoint-20250807-143022
```

### Session Summaries

View session summaries:

```bash
# List all session summaries
ls -la .claude/checkpoints/summary-*.md

# View a specific summary
cat .claude/checkpoints/summary-session-20250807-143022.md
```

## Testing Checkpoint Configuration

Run the test script to verify checkpoint configuration:

```bash
# Run checkpoint configuration tests
bash tests/test-checkpoint-configuration.sh
```

The test script verifies:
- Checkpoints are enabled by default
- Environment variable disables checkpoints
- CLI flag sets correct configuration
- All checkpoint functions respect the setting

## Best Practices

### When to Keep Checkpoints Enabled
- During development and experimentation
- When working on complex features
- When you want automatic backup points
- For tracking AI-assisted development sessions

### When to Disable Checkpoints
- In CI/CD pipelines
- During automated testing
- When working with existing git workflows
- In production environments
- When git history needs to stay clean

## Troubleshooting

### Checkpoints Still Being Created

If checkpoints are still being created after disabling:

1. Verify the environment variable:
   ```bash
   echo $CLAUDE_FLOW_CHECKPOINTS_ENABLED
   ```

2. Check settings.json:
   ```bash
   cat .claude/settings.json | grep CHECKPOINTS_ENABLED
   ```

3. Ensure checkpoint scripts have correct permissions:
   ```bash
   ls -la .claude/helpers/*checkpoint*.sh
   ```

### Missing Checkpoints

If expected checkpoints are missing:

1. Check if checkpoints are enabled:
   ```bash
   echo $CLAUDE_FLOW_CHECKPOINTS_ENABLED
   ```

2. Verify git is initialized:
   ```bash
   git status
   ```

3. Check for checkpoint files:
   ```bash
   ls -la .claude/checkpoints/
   ```

## Related Documentation

- [Claude Flow Documentation](https://github.com/ruvnet/claude-flow)
- [Git Integration Guide](./git-integration.md)
- [Session Management](./session-management.md)
- [Rollback Procedures](./rollback-procedures.md)