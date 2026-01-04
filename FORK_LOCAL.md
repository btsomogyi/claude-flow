# Installing This Fork Locally in Cursor

This guide explains how to install and use this fork of `claude-flow` locally within a Cursor IDE environment, without publishing to npm.

## Prerequisites

- Node.js >= 20.0.0
- npm >= 9.0.0
- Cursor IDE installed
- Git

## Step-by-Step Guide

### 1. Clone the Fork

```bash
# Clone your fork to a local directory
git clone https://github.com/btsomogyi/claude-flow.git
cd claude-flow
```

Or if you already have the repository:

```bash
cd /path/to/claude-flow
git pull origin main
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required dependencies and run the postinstall scripts.

### 3. Build the Project

```bash
npm run build
```

This compiles TypeScript to JavaScript in both ESM (`dist/`) and CommonJS (`dist-cjs/`) formats.

### 4. Link the Package Globally (Option A - Recommended)

This makes the `claude-flow` command available system-wide:

```bash
npm link
```

Verify the link worked:

```bash
claude-flow --version
```

### 5. Configure Cursor MCP Server

Cursor stores MCP server configuration in `~/.cursor/mcp.json`. You have two options:

#### Option A: Using the Globally Linked Package

If you used `npm link` in step 4:

```json
{
  "mcpServers": {
    "claude-flow": {
      "command": "claude-flow",
      "args": ["mcp", "start"]
    }
  }
}
```

#### Option B: Using the Absolute Path Directly

Point directly to the local installation without global linking:

```json
{
  "mcpServers": {
    "claude-flow": {
      "command": "node",
      "args": ["/absolute/path/to/claude-flow/bin/claude-flow.js", "mcp", "start"]
    }
  }
}
```

Replace `/absolute/path/to/claude-flow` with your actual path (e.g., `/home/btsomogyi/code/personal/claude-flow`).

#### Option C: Using npx with Local Path

```json
{
  "mcpServers": {
    "claude-flow": {
      "command": "npx",
      "args": ["--prefix", "/absolute/path/to/claude-flow", "claude-flow", "mcp", "start"]
    }
  }
}
```

### 6. Create or Edit Cursor MCP Configuration

If the file doesn't exist, create it:

```bash
mkdir -p ~/.cursor
cat > ~/.cursor/mcp.json << 'EOF'
{
  "mcpServers": {
    "claude-flow": {
      "command": "node",
      "args": ["/home/btsomogyi/code/personal/claude-flow/bin/claude-flow.js", "mcp", "start"]
    }
  }
}
EOF
```

Or edit the existing file:

```bash
# Open in your preferred editor
code ~/.cursor/mcp.json
# or
nano ~/.cursor/mcp.json
```

### 7. Restart Cursor

After modifying `mcp.json`, restart Cursor completely:

1. Close all Cursor windows
2. Quit Cursor from the system tray/menu bar
3. Reopen Cursor

### 8. Verify the MCP Server is Running

In Cursor, you can verify the MCP server is active by:

1. Opening the Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Looking for MCP-related commands
3. Checking if claude-flow tools are available in the AI assistant

## Updating the Local Installation

When you make changes to the fork or pull updates:

```bash
cd /path/to/claude-flow

# Pull latest changes
git pull

# Reinstall dependencies if package.json changed
npm install

# Rebuild
npm run build

# Restart Cursor to pick up changes
```

If you used `npm link`, the global command automatically uses the updated build.

## Troubleshooting

### MCP Server Not Appearing in Cursor

1. **Check the mcp.json syntax**: Ensure valid JSON format
   ```bash
   cat ~/.cursor/mcp.json | jq .
   ```

2. **Verify the path exists**:
   ```bash
   ls -la /path/to/claude-flow/bin/claude-flow.js
   ```

3. **Test the command manually**:
   ```bash
   node /path/to/claude-flow/bin/claude-flow.js mcp start
   ```
   Press Ctrl+C to stop after verifying it starts.

4. **Check Cursor logs**: Look for MCP-related errors in Cursor's developer console (Help > Toggle Developer Tools)

### "Module not found" Errors

Ensure dependencies are installed and the project is built:

```bash
cd /path/to/claude-flow
npm install
npm run build
```

### Permission Denied

If using `npm link`, you may need to fix permissions:

```bash
# Option 1: Use sudo (not recommended)
sudo npm link

# Option 2: Configure npm to use a different directory
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
npm link
```

### Changes Not Reflected After Rebuild

1. Ensure you ran `npm run build` after making changes
2. Restart Cursor completely (not just reload window)
3. If using `npm link`, verify the symlink is correct:
   ```bash
   which claude-flow
   ls -la $(which claude-flow)
   ```

## Development Workflow

For active development on the fork:

```bash
# Terminal 1: Watch for TypeScript changes and rebuild
npm run dev:build

# Terminal 2: Test changes
claude-flow --version
```

After making changes:
1. Save the file
2. Wait for TypeScript compilation (if using watch mode) or run `npm run build`
3. Restart Cursor to test MCP changes

## Removing the Local Installation

To unlink and clean up:

```bash
# Remove global link
npm unlink -g claude-flow

# Remove from Cursor config
# Edit ~/.cursor/mcp.json and remove the claude-flow entry
```

## Using Alongside the Published Package

If you want to use both the official package and your fork:

1. Give your fork a different name in `mcp.json`:
   ```json
   {
     "mcpServers": {
       "claude-flow-fork": {
         "command": "node",
         "args": ["/path/to/claude-flow/bin/claude-flow.js", "mcp", "start"]
       },
       "claude-flow-official": {
         "command": "npx",
         "args": ["claude-flow@alpha", "mcp", "start"]
       }
     }
   }
   ```

2. Note: Running multiple MCP servers may hit Cursor's tool limits. See `docs/FILTERING.md` for configuring tool filtering.
