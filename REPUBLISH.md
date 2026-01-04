# Republishing as an Alternative Package

This guide explains how to publish a fork of `claude-flow` as an alternative package (e.g., `claude-flow-bts`) to npm, making the binary installable and usable elsewhere.

## Prerequisites

- Node.js >= 20.0.0
- npm account with publishing rights
- npm CLI logged in (`npm login`)

## Step-by-Step Guide

### 1. Update package.json

Edit `package.json` to change the package identity:

```json
{
  "name": "claude-flow-bts",
  "version": "1.0.0",
  "bin": {
    "claude-flow-bts": "bin/claude-flow.js"
  }
}
```

**Required changes:**
- `name`: Change from `"claude-flow"` to `"claude-flow-bts"`
- `version`: Reset to `"1.0.0"` (or your preferred starting version)
- `bin`: Change the key from `"claude-flow"` to `"claude-flow-bts"` (the value stays the same)

**Optional changes to consider:**
- `description`: Update to indicate this is a fork
- `repository.url`: Point to your fork's URL
- `bugs.url`: Point to your fork's issues
- `homepage`: Point to your fork's README
- `author`: Add yourself or change as appropriate

### 2. Update MCP Server Name (Optional)

If you want MCP clients to recognize this as a distinct server, update:

```json
{
  "mcpName": "io.github.btsomogyi/claude-flow-bts"
}
```

### 3. Build the Package

Ensure all source files are compiled:

```bash
# Clean and rebuild everything
npm run build
```

This runs:
- `clean` - Removes dist and dist-cjs directories
- `update-version` - Updates version in bin files
- `build:esm` - Compiles ESM modules
- `build:cjs` - Compiles CommonJS modules
- `build:binary` - Creates standalone binaries (optional)

### 4. Verify the Package Contents

Check what will be published:

```bash
# Preview the package contents
npm pack --dry-run
```

Review the output to ensure all necessary files are included. The `files` array in `package.json` controls what gets published.

### 5. Test Locally (Recommended)

Before publishing, test the package locally:

```bash
# Create a tarball
npm pack

# In another directory, install and test
cd /tmp
npm install /path/to/claude-flow-bts-1.0.0.tgz
npx claude-flow-bts --version
```

### 6. Publish to npm

#### Option A: Publish as Public Package

```bash
# Publish publicly (default for unscoped packages)
npm publish --access public
```

#### Option B: Publish with a Tag

```bash
# Publish with alpha/beta tag
npm publish --tag alpha

# Users install with:
# npm install claude-flow-bts@alpha
```

#### Option C: Publish to a Scope

If you prefer a scoped package (e.g., `@btsomogyi/claude-flow`):

1. Update `package.json`:
   ```json
   {
     "name": "@btsomogyi/claude-flow",
     "bin": {
       "claude-flow-bts": "bin/claude-flow.js"
     }
   }
   ```

2. Publish:
   ```bash
   npm publish --access public
   ```

### 7. Verify Publication

After publishing:

```bash
# Check the package on npm
npm view claude-flow-bts

# Test installation globally
npm install -g claude-flow-bts
claude-flow-bts --version

# Or test with npx
npx claude-flow-bts --version
```

## Usage After Publishing

Users can install and use your fork:

```bash
# Global installation
npm install -g claude-flow-bts
claude-flow-bts mcp start

# npx usage (no install required)
npx claude-flow-bts mcp start

# Add as MCP server in Claude Code
claude mcp add claude-flow-bts npx claude-flow-bts mcp start
```

## Keeping Your Fork Updated

To sync with upstream changes:

```bash
# Add upstream remote (one-time)
git remote add upstream https://github.com/ruvnet/claude-flow.git

# Fetch and merge upstream changes
git fetch upstream
git merge upstream/main

# Resolve any conflicts, then rebuild and publish
npm run build
npm version patch  # or minor/major
npm publish
```

## Version Management

After initial publication, use npm's version commands:

```bash
# Patch release (1.0.0 -> 1.0.1)
npm version patch && npm publish

# Minor release (1.0.1 -> 1.1.0)
npm version minor && npm publish

# Major release (1.1.0 -> 2.0.0)
npm version major && npm publish
```

## Troubleshooting

### "Package name already exists"
Choose a different package name or use a scoped package (`@username/package-name`).

### "You must be logged in to publish"
Run `npm login` and authenticate with your npm account.

### "Cannot publish over existing version"
Bump the version number: `npm version patch`

### Binary not found after install
Ensure the `bin` field in `package.json` points to the correct file and that file has a proper shebang (`#!/usr/bin/env node`).

### Missing files in published package
Check the `files` array in `package.json` includes all necessary directories and files.
