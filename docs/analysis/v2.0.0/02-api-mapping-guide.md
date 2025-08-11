# Deno to WebAPIs and Node ESM Mapping Guide

## Overview

This document provides exact mappings from Deno APIs to their WebAPI and Node.js ESM `node:*` module equivalents, focusing on modern standards-compliant implementations.

## Migration Philosophy

### Modern Node.js Approach
- **ESM `node:*` imports**: Explicit, tree-shakeable, standards-compliant
- **WebAPIs**: Cross-runtime compatibility (Node.js, Bun, Deno)  
- **TypeScript-first**: Native type support without @types packages
- **Standards compliance**: Following Web Platform APIs where possible

## File System Operations

### Directory Operations

#### `Deno.mkdir()`
```typescript
// Deno
await Deno.mkdir(path, { recursive: true });

// WebAPI + Node ESM
import { mkdir } from 'node:fs/promises';
await mkdir(path, { recursive: true });
```

#### `Deno.readDir()`
```typescript
// Deno
for await (const entry of Deno.readDir(path)) {
  console.log(entry.name, entry.isFile);
}

// WebAPI + Node ESM  
import { readdir } from 'node:fs/promises';
const entries = await readdir(path, { withFileTypes: true });
for (const entry of entries) {
  console.log(entry.name, entry.isFile());
}

// WebAPI-style wrapper
export const readDir = async (path: string) => {
  const entries = await readdir(path, { withFileTypes: true });
  return entries.map(entry => ({
    name: entry.name,
    isFile: entry.isFile(),
    isDirectory: entry.isDirectory(),
    isSymlink: entry.isSymbolicLink()
  }));
};
```

#### `Deno.remove()`
```typescript
// Deno
await Deno.remove(path, { recursive: true });

// WebAPI + Node ESM
import { rm } from 'node:fs/promises';
await rm(path, { recursive: true, force: true });
```

### File Operations

#### `Deno.readTextFile()` / `Deno.writeTextFile()`
```typescript
// Deno
const content = await Deno.readTextFile(path);
await Deno.writeTextFile(path, content);

// WebAPI + Node ESM
import { readFile, writeFile } from 'node:fs/promises';

const content = await readFile(path, 'utf-8');
await writeFile(path, content, 'utf-8');

// WebAPI-style with encoding handling
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const readTextFile = async (path: string): Promise<string> => {
  const buffer = await readFile(path);
  return decoder.decode(buffer);
};

export const writeTextFile = async (path: string, content: string): Promise<void> => {
  const encoded = encoder.encode(content);
  await writeFile(path, encoded);
};
```

#### `Deno.copyFile()`
```typescript
// Deno
await Deno.copyFile(src, dest);

// WebAPI + Node ESM
import { copyFile } from 'node:fs/promises';
await copyFile(src, dest);
```

#### `Deno.stat()`
```typescript
// Deno
const info = await Deno.stat(path);

// WebAPI + Node ESM
import { stat } from 'node:fs/promises';
const info = await stat(path);

// WebAPI-compatible wrapper
export const statFile = async (path: string) => {
  const stats = await stat(path);
  return {
    isFile: stats.isFile(),
    isDirectory: stats.isDirectory(), 
    isSymlink: stats.isSymbolicLink(),
    size: stats.size,
    mtime: stats.mtime,
    atime: stats.atime,
    birthtime: stats.birthtime,
    mode: stats.mode
  };
};
```

## Process Operations

### Command Line Arguments

#### `Deno.args`
```typescript
// Deno
const args = Deno.args;

// WebAPI + Node ESM
import process from 'node:process';
const args = process.argv.slice(2);

// Or using globalThis (WebAPI style)
const args = globalThis.process?.argv.slice(2) ?? [];
```

### Process Information

#### `Deno.pid`
```typescript
// Deno
const processId = Deno.pid;

// WebAPI + Node ESM
import process from 'node:process';
const processId = process.pid;

// WebAPI style
const processId = globalThis.process?.pid;
```

### Process Control

#### `Deno.exit()`
```typescript
// Deno
Deno.exit(code);

// WebAPI + Node ESM
import process from 'node:process';
process.exit(code);

// WebAPI style
globalThis.process?.exit(code);
```

#### `Deno.kill()`
```typescript
// Deno
Deno.kill(pid, 'SIGTERM');

// WebAPI + Node ESM
import process from 'node:process';
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

// WebAPI + Node ESM - Standards-compliant Command class
import { spawn } from 'node:child_process';
import { promisify } from 'node:util';

export class Command {
  constructor(
    private command: string, 
    private options: {
      args?: string[];
      cwd?: string;
      env?: Record<string, string>;
      stdin?: 'piped' | 'inherit' | 'null';
      stdout?: 'piped' | 'inherit' | 'null'; 
      stderr?: 'piped' | 'inherit' | 'null';
    } = {}
  ) {}

  async output(): Promise<{
    success: boolean;
    code: number;
    stdout: Uint8Array;
    stderr: Uint8Array;
  }> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, this.options.args ?? [], {
        cwd: this.options.cwd,
        env: { ...process.env, ...this.options.env },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      child.stdout?.on('data', data => stdout.push(data));
      child.stderr?.on('data', data => stderr.push(data));

      child.on('close', code => {
        resolve({
          success: code === 0,
          code: code ?? -1,
          stdout: new Uint8Array(Buffer.concat(stdout)),
          stderr: new Uint8Array(Buffer.concat(stderr))
        });
      });

      child.on('error', reject);
    });
  }

  spawn() {
    const child = spawn(this.command, this.options.args ?? [], {
      cwd: this.options.cwd,
      env: { ...process.env, ...this.options.env },
      stdio: [
        this.options.stdin === 'inherit' ? 'inherit' : 'pipe',
        this.options.stdout === 'inherit' ? 'inherit' : 'pipe',
        this.options.stderr === 'inherit' ? 'inherit' : 'pipe'
      ]
    });

    return {
      status: new Promise<{ success: boolean; code: number }>(resolve => {
        child.on('close', code => {
          resolve({ success: code === 0, code: code ?? -1 });
        });
      }),
      stdout: child.stdout,
      stderr: child.stderr,
      stdin: child.stdin,
      kill: (signal?: NodeJS.Signals) => child.kill(signal),
      pid: child.pid
    };
  }
}

// Usage
const command = new Command('node', {
  args: ['--version'],
  env: process.env
});
const result = await command.output();
```

## Stream Operations (WebStreams API)

### Standard Streams with WebStreams

#### `Deno.stdin`, `Deno.stdout`, `Deno.stderr`
```typescript
// Deno
await Deno.stdout.write(encoder.encode(text));
const n = await Deno.stdin.read(buffer);

// WebAPI + Node ESM with WebStreams
import process from 'node:process';
import { Readable, Writable } from 'node:stream/web';

// Modern WebStreams approach
export class StandardStreams {
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  // Stdout as WritableStream
  get stdout(): WritableStream<Uint8Array> {
    return new WritableStream({
      write: async (chunk) => {
        return new Promise((resolve, reject) => {
          process.stdout.write(chunk, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    });
  }

  // Stdin as ReadableStream
  get stdin(): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        process.stdin.on('data', (chunk) => {
          controller.enqueue(new Uint8Array(chunk));
        });

        process.stdin.on('end', () => {
          controller.close();
        });

        process.stdin.on('error', (err) => {
          controller.error(err);
        });
      }
    });
  }

  async writeStdout(data: string | Uint8Array): Promise<void> {
    const writer = this.stdout.getWriter();
    try {
      const chunk = typeof data === 'string' ? this.encoder.encode(data) : data;
      await writer.write(chunk);
    } finally {
      writer.releaseLock();
    }
  }

  async readStdin(buffer: Uint8Array): Promise<number> {
    const reader = this.stdin.getReader();
    try {
      const { done, value } = await reader.read();
      if (done) return 0;
      
      const bytesToCopy = Math.min(value.length, buffer.length);
      buffer.set(value.slice(0, bytesToCopy));
      return bytesToCopy;
    } finally {
      reader.releaseLock();
    }
  }
}

// Simplified direct usage
export const writeStdout = async (text: string): Promise<void> => {
  const encoder = new TextEncoder();
  return new Promise((resolve, reject) => {
    process.stdout.write(encoder.encode(text), (err) => {
      if (err) reject(err);
      else resolve();
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

// WebAPI + Node ESM
import process from 'node:process';

export const env = {
  get: (key: string): string | undefined => process.env[key],
  set: (key: string, value: string): void => {
    process.env[key] = value;
  },
  delete: (key: string): void => {
    delete process.env[key];
  },
  toObject: (): Record<string, string | undefined> => ({ ...process.env }),
  has: (key: string): boolean => key in process.env
};

// WebAPI style with globalThis
const env = {
  get: (key: string) => globalThis.process?.env[key],
  toObject: () => ({ ...globalThis.process?.env })
};
```

### Platform Information

#### `Deno.build`
```typescript
// Deno
const os = Deno.build.os;
const arch = Deno.build.arch;

// WebAPI + Node ESM
import process from 'node:process';

export const build = {
  os: process.platform === 'win32' ? 'windows' :
      process.platform === 'darwin' ? 'darwin' :
      process.platform === 'linux' ? 'linux' : 
      process.platform,
  arch: process.arch,
  target: `${process.arch}-${process.platform}`,
  platform: process.platform
};

// WebAPI style with feature detection
export const getBuildInfo = () => {
  const platform = globalThis.process?.platform ?? 'unknown';
  const arch = globalThis.process?.arch ?? 'unknown';
  
  return {
    os: platform === 'win32' ? 'windows' : 
        platform === 'darwin' ? 'darwin' :
        platform === 'linux' ? 'linux' : platform,
    arch,
    target: `${arch}-${platform}`,
    platform
  };
};
```

### Memory Usage

#### `Deno.memoryUsage()`
```typescript
// Deno
const memory = Deno.memoryUsage();

// WebAPI + Node ESM
import process from 'node:process';

export const memoryUsage = () => {
  const usage = process.memoryUsage();
  return {
    rss: usage.rss,
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    // Deno compatibility
    heap: usage.heapUsed
  };
};

// WebAPI style
export const getMemoryUsage = () => {
  return globalThis.process?.memoryUsage() ?? {
    rss: 0,
    heapUsed: 0, 
    heapTotal: 0,
    external: 0
  };
};
```

## Signal Handling

#### `Deno.addSignalListener()`
```typescript
// Deno
Deno.addSignalListener('SIGINT', handler);

// WebAPI + Node ESM
import process from 'node:process';

export const addSignalListener = (signal: NodeJS.Signals, handler: () => void): void => {
  process.on(signal, handler);
};

// Multiple signal helper
export const addSignalListeners = (signals: NodeJS.Signals[], handler: () => void): void => {
  signals.forEach(signal => process.on(signal, handler));
};

// WebAPI style with AbortController
export const createSignalHandler = (signal: NodeJS.Signals): AbortController => {
  const controller = new AbortController();
  
  process.on(signal, () => {
    controller.abort();
  });
  
  return controller;
};
```

## Error Types (Web-compatible)

### Custom Error Classes

#### `Deno.errors.*`
```typescript
// Deno
throw new Deno.errors.NotFound('File not found');

// WebAPI + Node ESM - Standards-compliant errors
export class WebCompatErrors {
  static NotFound = class NotFoundError extends Error {
    readonly name = 'NotFoundError';
    readonly code = 'ENOENT';
    
    constructor(message = 'Not found', options?: ErrorOptions) {
      super(message, options);
    }
  };

  static AlreadyExists = class AlreadyExistsError extends Error {
    readonly name = 'AlreadyExistsError'; 
    readonly code = 'EEXIST';
    
    constructor(message = 'Already exists', options?: ErrorOptions) {
      super(message, options);
    }
  };

  static PermissionDenied = class PermissionDeniedError extends Error {
    readonly name = 'PermissionDeniedError';
    readonly code = 'EACCES';
    
    constructor(message = 'Permission denied', options?: ErrorOptions) {
      super(message, options);
    }
  };
}

// Map Node.js errors to WebAPI-style errors
export const mapNodeError = (error: NodeJS.ErrnoException): Error => {
  switch (error.code) {
    case 'ENOENT':
      return new WebCompatErrors.NotFound(error.message, { cause: error });
    case 'EEXIST':
      return new WebCompatErrors.AlreadyExists(error.message, { cause: error });
    case 'EACCES':
    case 'EPERM':
      return new WebCompatErrors.PermissionDenied(error.message, { cause: error });
    default:
      return error;
  }
};
```

## Text Encoding (WebAPI Standard)

### TextEncoder/TextDecoder

```typescript
// Deno (already WebAPI compliant)
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// WebAPI + Node ESM (same API!)
// These are already available globally in modern Node.js
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Explicit import if needed
import { TextEncoder, TextDecoder } from 'node:util';

// WebAPI-first approach with fallback
const encoder = globalThis.TextEncoder ?? 
  (await import('node:util')).TextEncoder;
```

## Runtime Detection (Modern Approach)

### Feature-based Detection

```typescript
// Old Deno/Node dual support
const isDeno = typeof Deno !== 'undefined';
const isNode = typeof process !== 'undefined' && process.versions?.node;

// Modern feature-based detection
const hasNodeFS = async () => {
  try {
    await import('node:fs');
    return true;
  } catch {
    return false;
  }
};

const hasWebStreams = () => {
  return typeof ReadableStream !== 'undefined' && 
         typeof WritableStream !== 'undefined';
};

// Runtime agnostic approach
export const createRuntimeAdapter = async () => {
  const features = {
    nodeFS: await hasNodeFS(),
    webStreams: hasWebStreams(),
    textEncoder: typeof TextEncoder !== 'undefined',
    process: typeof globalThis.process !== 'undefined'
  };

  return {
    features,
    // Use WebAPIs when possible, fallback to Node-specific
    fs: features.nodeFS ? await import('node:fs/promises') : null,
    process: features.process ? globalThis.process : null,
    streams: features.webStreams ? { 
      ReadableStream: globalThis.ReadableStream,
      WritableStream: globalThis.WritableStream
    } : null
  };
};
```

## Migration Utilities

### WebAPI-first Utilities

```typescript
// Unified API that works across runtimes
export const createWebCompatAPI = async () => {
  const fs = await import('node:fs/promises');
  const process = globalThis.process;
  
  return {
    // File operations
    readTextFile: async (path: string): Promise<string> => {
      const buffer = await fs.readFile(path);
      return new TextDecoder().decode(buffer);
    },
    
    writeTextFile: async (path: string, content: string): Promise<void> => {
      const encoded = new TextEncoder().encode(content);
      await fs.writeFile(path, encoded);
    },
    
    mkdir: fs.mkdir,
    remove: fs.rm,
    stat: fs.stat,
    
    // Process operations
    args: process?.argv.slice(2) ?? [],
    pid: process?.pid ?? 0,
    env: {
      get: (key: string) => process?.env[key],
      toObject: () => ({ ...process?.env })
    },
    
    // Command execution  
    Command,
    
    // Streams
    StandardStreams,
    
    // Errors
    errors: WebCompatErrors
  };
};
```

## Testing Patterns

### WebAPI Compatibility Testing

```typescript
// Test that WebAPI standards work correctly
export const testWebAPICompliance = async () => {
  // TextEncoder/TextDecoder should work
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const text = 'Hello, World!';
  const encoded = encoder.encode(text);
  const decoded = decoder.decode(encoded);
  console.assert(text === decoded, 'TextEncoder/TextDecoder failed');
  
  // WebStreams should work
  const readable = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('test'));
      controller.close();
    }
  });
  
  const reader = readable.getReader();
  const { value } = await reader.read();
  console.assert(value instanceof Uint8Array, 'WebStreams failed');
  
  console.log('✅ WebAPI compliance verified');
};
```

## Performance Considerations

### ESM Benefits
1. **Tree Shaking**: Only import what you need from `node:*` modules
2. **Static Analysis**: Better bundling and optimization
3. **Explicit Dependencies**: Clear import/export relationships
4. **Standards Compliance**: Future-proof with web standards

### WebAPI Benefits
1. **Cross-Runtime**: Code works in Node.js, Bun, Deno
2. **Native Performance**: Direct browser/runtime optimizations
3. **Type Safety**: Built-in TypeScript definitions
4. **Standards Track**: Following web platform evolution

This mapping guide ensures a modern, standards-compliant migration that leverages the best of both WebAPIs and Node.js ESM modules.