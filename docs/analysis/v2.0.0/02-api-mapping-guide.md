# Deno to Node.js API Mapping Guide

## Overview

This document provides exact mappings from Deno APIs to their Node.js equivalents, including code examples and implementation patterns.

## File System Operations

### Directory Operations

#### `Deno.mkdir()`
```typescript
// Deno
await Deno.mkdir(path, { recursive: true });

// Node.js
import { mkdir } from 'fs/promises';
await mkdir(path, { recursive: true });
```

#### `Deno.readDir()`
```typescript
// Deno
for await (const entry of Deno.readDir(path)) {
  console.log(entry.name, entry.isFile);
}

// Node.js
import { readdir } from 'fs/promises';
const entries = await readdir(path, { withFileTypes: true });
for (const entry of entries) {
  console.log(entry.name, entry.isFile());
}
```

#### `Deno.remove()`
```typescript
// Deno
await Deno.remove(path, { recursive: true });

// Node.js
import { rm } from 'fs/promises';
await rm(path, { recursive: true, force: true });
```

### File Operations

#### `Deno.readTextFile()`
```typescript
// Deno
const content = await Deno.readTextFile(path);

// Node.js
import { readFile } from 'fs/promises';
const content = await readFile(path, 'utf-8');
```

#### `Deno.writeTextFile()`
```typescript
// Deno
await Deno.writeTextFile(path, content);

// Node.js
import { writeFile } from 'fs/promises';
await writeFile(path, content, 'utf-8');
```

#### `Deno.copyFile()`
```typescript
// Deno
await Deno.copyFile(src, dest);

// Node.js
import { copyFile } from 'fs/promises';
await copyFile(src, dest);
```

#### `Deno.stat()`
```typescript
// Deno
const info = await Deno.stat(path);

// Node.js
import { stat } from 'fs/promises';
const info = await stat(path);
```

#### `Deno.chmod()`
```typescript
// Deno
await Deno.chmod(path, 0o755);

// Node.js
import { chmod } from 'fs/promises';
await chmod(path, 0o755);
```

## Process Operations

### Command Line Arguments

#### `Deno.args`
```typescript
// Deno
const args = Deno.args;

// Node.js
const args = process.argv.slice(2);
```

### Process Information

#### `Deno.pid`
```typescript
// Deno
const processId = Deno.pid;

// Node.js
const processId = process.pid;
```

### Process Control

#### `Deno.exit()`
```typescript
// Deno
Deno.exit(code);

// Node.js
process.exit(code);
```

#### `Deno.kill()`
```typescript
// Deno
Deno.kill(pid, 'SIGTERM');

// Node.js
process.kill(pid, 'SIGTERM');
```

### Command Execution

#### `Deno.Command`
```typescript
// Deno
const command = new Deno.Command('node', {
  args: ['--version'],
  env: { ...Deno.env.toObject() }
});
const result = await command.output();

// Node.js
import { spawn } from 'child_process';
import { promisify } from 'util';

const spawnCommand = (cmd, args, options) => {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      ...options,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = [];
    let stderr = [];
    
    child.stdout.on('data', data => stdout.push(data));
    child.stderr.on('data', data => stderr.push(data));
    
    child.on('close', code => {
      resolve({
        code,
        success: code === 0,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr)
      });
    });
    
    child.on('error', reject);
  });
};

const result = await spawnCommand('node', ['--version'], {
  env: { ...process.env }
});
```

## I/O Stream Operations

### Standard Streams

#### `Deno.stdin`, `Deno.stdout`, `Deno.stderr`
```typescript
// Deno
await Deno.stdout.write(encoder.encode(text));
const n = await Deno.stdin.read(buffer);

// Node.js
import { promisify } from 'util';

// Stdout
const writeStdout = promisify(process.stdout.write.bind(process.stdout));
await writeStdout(text);

// Stdin (more complex - requires event handling)
const readStdin = (buffer) => {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.once('data', (data) => {
      const bytes = Math.min(data.length, buffer.length);
      buffer.set(data.slice(0, bytes));
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      resolve(bytes);
    });
  });
};
```

## Environment and System Information

### Environment Variables

#### `Deno.env`
```typescript
// Deno
const env = Deno.env.toObject();
const value = Deno.env.get('PATH');

// Node.js
const env = { ...process.env };
const value = process.env.PATH;
```

### Platform Information

#### `Deno.build`
```typescript
// Deno
const os = Deno.build.os;
const arch = Deno.build.arch;

// Node.js
const os = process.platform === 'win32' ? 'windows' : 
           process.platform === 'darwin' ? 'darwin' :
           process.platform === 'linux' ? 'linux' : process.platform;
const arch = process.arch;
```

### Memory Usage

#### `Deno.memoryUsage()`
```typescript
// Deno
const memory = Deno.memoryUsage();

// Node.js
const memory = process.memoryUsage();
```

## Signal Handling

#### `Deno.addSignalListener()`
```typescript
// Deno
Deno.addSignalListener('SIGINT', handler);

// Node.js
process.on('SIGINT', handler);
```

## Error Types

### Custom Error Classes

#### `Deno.errors.*`
```typescript
// Deno
throw new Deno.errors.NotFound('File not found');

// Node.js
class DenoCompatErrors {
  static NotFound = class extends Error {
    constructor(message) {
      super(message);
      this.name = 'NotFound';
    }
  };
  
  static AlreadyExists = class extends Error {
    constructor(message) {
      super(message);
      this.name = 'AlreadyExists';
    }
  };
  
  static PermissionDenied = class extends Error {
    constructor(message) {
      super(message);
      this.name = 'PermissionDenied';
    }
  };
}

throw new DenoCompatErrors.NotFound('File not found');
```

## Import Meta Compatibility

#### `import.meta.url` and `Deno.execPath()`
```typescript
// Deno
const isMain = import.meta.url === `file://${Deno.execPath()}`;

// Node.js
import { fileURLToPath } from 'url';
import { normalize } from 'path';

const isMain = normalize(process.argv[1]) === normalize(fileURLToPath(import.meta.url));
```

## Runtime Detection Pattern

### Unified Runtime Detection
```typescript
// Current pattern in codebase
const isDeno = typeof Deno !== 'undefined';
const isNode = typeof process !== 'undefined' && process.versions?.node;

// Post-migration (Node.js only)
const isNode = true;
const isDeno = false;
```

## Migration Helpers

### Utility Functions
```typescript
// Helper function for cross-platform compatibility
export const createNodeCompat = () => ({
  // File system
  mkdir: (path, options) => mkdir(path, { recursive: options?.recursive }),
  readDir: async (path) => {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.map(entry => ({
      name: entry.name,
      isFile: entry.isFile(),
      isDirectory: entry.isDirectory()
    }));
  },
  
  // Process
  args: process.argv.slice(2),
  pid: process.pid,
  exit: process.exit,
  
  // Environment
  env: {
    get: (key) => process.env[key],
    toObject: () => ({ ...process.env })
  },
  
  // Platform
  build: {
    os: process.platform === 'win32' ? 'windows' : process.platform,
    arch: process.arch
  }
});
```

## Testing Patterns

### Before/After Comparison
```typescript
// Test helper for validating migrations
export const testMigration = async (denoCode, nodeCode, input) => {
  // This would be used during migration to ensure behavior parity
  const denoResult = await runDenoCode(denoCode, input);
  const nodeResult = await runNodeCode(nodeCode, input);
  
  assert.deepEqual(denoResult, nodeResult);
};
```

## Performance Considerations

### Differences to Watch
1. **Stream handling**: Node.js streams have different performance characteristics
2. **File I/O**: Node.js may require different buffer management
3. **Process spawning**: Child process creation patterns differ slightly
4. **Memory usage**: `process.memoryUsage()` returns different structure than `Deno.memoryUsage()`

## Next Steps

1. Use this mapping to update each file systematically
2. Implement utility functions for common patterns  
3. Create test cases to verify behavior parity
4. Monitor performance after migration