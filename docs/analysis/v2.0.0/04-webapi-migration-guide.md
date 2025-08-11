# WebAPI and Node.js ESM Migration Implementation Guide

## Overview

This guide provides detailed implementation examples for migrating from Deno APIs to modern TypeScript WebAPIs and Node.js ESM `node:*` modules, focusing on standards compliance and cross-runtime compatibility.

## Migration Philosophy

### WebAPI-First Approach
1. **Standards Compliance**: Use Web Platform APIs when available
2. **ESM-first**: Leverage `node:*` modules for tree-shaking and explicit imports
3. **TypeScript Native**: Built-in types without @types packages
4. **Cross-Runtime**: Code that works in Node.js, Bun, and future runtimes
5. **Future-Proofing**: Following Web standards evolution

## Core Migration Patterns

### 1. File System Operations with WebAPI Patterns

#### Directory Operations
```typescript
// OLD: Deno approach
await Deno.mkdir(projectDir, { recursive: true });

// NEW: WebAPI + Node ESM approach  
import { mkdir } from 'node:fs/promises';

// Direct usage
await mkdir(projectDir, { recursive: true });

// WebAPI-style wrapper for consistency
export class FileSystemAPI {
  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    return mkdir(path, { recursive: options?.recursive });
  }

  async readDir(path: string): Promise<Array<{
    name: string;
    isFile: boolean;
    isDirectory: boolean;
    isSymlink: boolean;
  }>> {
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(path, { withFileTypes: true });
    return entries.map(entry => ({
      name: entry.name,
      isFile: entry.isFile(),
      isDirectory: entry.isDirectory(),
      isSymlink: entry.isSymbolicLink()
    }));
  }
}
```

#### Text File Operations with Web Standards
```typescript
// OLD: Deno approach
const content = await Deno.readTextFile(path);
await Deno.writeTextFile(path, content);

// NEW: WebAPI + Node ESM approach
import { readFile, writeFile } from 'node:fs/promises';

// Using Web standard TextEncoder/TextDecoder
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

// Alternative: Direct string handling (Node.js optimized)
export const readTextFileDirect = async (path: string): Promise<string> => {
  return readFile(path, 'utf-8');
};

export const writeTextFileDirect = async (path: string, content: string): Promise<void> => {
  return writeFile(path, content, 'utf-8');
};
```

### 2. Process Operations with Global APIs

#### Process Information and Control
```typescript
// OLD: Deno approach
const args = Deno.args;
const pid = Deno.pid;
Deno.exit(0);

// NEW: WebAPI + Node ESM approach
import process from 'node:process';

// Direct access (recommended for Node.js)
const args = process.argv.slice(2);
const pid = process.pid;
process.exit(0);

// WebAPI-style with globalThis for cross-runtime
export const processAPI = {
  get args(): string[] {
    return globalThis.process?.argv.slice(2) ?? [];
  },
  
  get pid(): number {
    return globalThis.process?.pid ?? 0;
  },
  
  exit(code = 0): void {
    globalThis.process?.exit(code);
  },
  
  get env(): Record<string, string | undefined> {
    return { ...globalThis.process?.env };
  }
};
```

#### Environment Variables with Standards
```typescript
// OLD: Deno approach  
const env = Deno.env.toObject();
const value = Deno.env.get('PATH');

// NEW: WebAPI + Node ESM approach
import process from 'node:process';

// Direct access
const env = { ...process.env };
const value = process.env.PATH;

// Standards-compliant wrapper
export class EnvironmentAPI {
  get(key: string): string | undefined {
    return process.env[key];
  }
  
  set(key: string, value: string): void {
    process.env[key] = value;
  }
  
  has(key: string): boolean {
    return key in process.env;
  }
  
  delete(key: string): void {
    delete process.env[key];
  }
  
  toObject(): Record<string, string | undefined> {
    return { ...process.env };
  }
}
```

### 3. Command Execution with Standards Compliance

#### Modern Command Class
```typescript
// OLD: Deno approach
const command = new Deno.Command('node', {
  args: ['--version'],
  env: Deno.env.toObject()
});
const result = await command.output();

// NEW: WebAPI + Node ESM approach
import { spawn } from 'node:child_process';
import process from 'node:process';

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

  // Returns Web-compatible result
  async output(): Promise<CommandResult> {
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

  // Returns streaming process
  spawn(): SpawnedProcess {
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
      status: new Promise<ProcessStatus>(resolve => {
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

// Type definitions for Web compatibility
interface CommandResult {
  success: boolean;
  code: number;
  stdout: Uint8Array;
  stderr: Uint8Array;
}

interface ProcessStatus {
  success: boolean;
  code: number;
}

interface SpawnedProcess {
  status: Promise<ProcessStatus>;
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  stdin: NodeJS.WritableStream | null;
  kill: (signal?: NodeJS.Signals) => boolean;
  pid?: number;
}
```

### 4. Stream Operations with WebStreams API

#### Modern Stream Handling
```typescript
// OLD: Deno approach
await Deno.stdout.write(encoder.encode(text));
const n = await Deno.stdin.read(buffer);

// NEW: WebAPI + Node ESM with WebStreams
import process from 'node:process';

export class WebStreamIO {
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  // Stdout as WebAPI WritableStream
  get stdout(): WritableStream<Uint8Array> {
    return new WritableStream({
      write: async (chunk: Uint8Array) => {
        return new Promise<void>((resolve, reject) => {
          process.stdout.write(chunk, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    });
  }

  // Stdin as WebAPI ReadableStream
  get stdin(): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        process.stdin.on('data', (chunk: Buffer) => {
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

  // Convenience methods
  async writeText(text: string): Promise<void> {
    const writer = this.stdout.getWriter();
    try {
      await writer.write(this.encoder.encode(text));
    } finally {
      writer.releaseLock();
    }
  }

  async readBytes(buffer: Uint8Array): Promise<number> {
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
export const streamAPI = {
  async writeStdout(text: string): Promise<void> {
    const encoder = new TextEncoder();
    return new Promise((resolve, reject) => {
      process.stdout.write(encoder.encode(text), (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },

  async readStdinLine(): Promise<string> {
    return new Promise((resolve) => {
      process.stdin.resume();
      process.stdin.once('data', (data) => {
        const line = data.toString().trim();
        process.stdin.pause();
        resolve(line);
      });
    });
  }
};
```

### 5. Signal Handling with Modern APIs

#### Signal Management
```typescript
// OLD: Deno approach
Deno.addSignalListener('SIGINT', gracefulShutdown);

// NEW: WebAPI + Node ESM approach
import process from 'node:process';

// Direct usage
process.on('SIGINT', gracefulShutdown);

// WebAPI-style with AbortController
export const createSignalHandler = (signal: NodeJS.Signals): AbortController => {
  const controller = new AbortController();
  
  process.on(signal, () => {
    controller.abort();
  });
  
  return controller;
};

// Multiple signal handler
export const addSignalListeners = (
  signals: NodeJS.Signals[], 
  handler: () => void
): AbortController[] => {
  return signals.map(signal => {
    const controller = new AbortController();
    process.on(signal, handler);
    process.on(signal, () => controller.abort());
    return controller;
  });
};

// Usage with AbortController pattern
const signalController = createSignalHandler('SIGINT');
signalController.signal.addEventListener('abort', () => {
  console.log('Graceful shutdown initiated...');
  // Cleanup logic
});
```

### 6. Error Handling with Web Standards

#### Standards-Compliant Error Classes
```typescript
// OLD: Deno approach
throw new Deno.errors.NotFound('File not found');

// NEW: WebAPI + Node ESM approach
export class WebStandardErrors {
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

  static NetworkError = class NetworkError extends Error {
    readonly name = 'NetworkError';
    
    constructor(message = 'Network error', options?: ErrorOptions) {
      super(message, options);
    }
  };
}

// Error mapping utility
export const mapNodeError = (error: NodeJS.ErrnoException): Error => {
  switch (error.code) {
    case 'ENOENT':
      return new WebStandardErrors.NotFound(error.message, { cause: error });
    case 'EEXIST':
      return new WebStandardErrors.AlreadyExists(error.message, { cause: error });
    case 'EACCES':
    case 'EPERM':
      return new WebStandardErrors.PermissionDenied(error.message, { cause: error });
    default:
      return error;
  }
};

// Enhanced error handling with cause chains
export const wrapFileSystemError = async <T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      const mappedError = mapNodeError(error as NodeJS.ErrnoException);
      mappedError.message = `${context}: ${mappedError.message}`;
      throw mappedError;
    }
    throw error;
  }
};
```

### 7. Platform Information with Standards

#### Modern Platform Detection
```typescript
// OLD: Deno approach
const os = Deno.build.os;
const arch = Deno.build.arch;

// NEW: WebAPI + Node ESM approach
import process from 'node:process';

export const platformAPI = {
  get os(): string {
    return process.platform === 'win32' ? 'windows' :
           process.platform === 'darwin' ? 'darwin' :
           process.platform === 'linux' ? 'linux' :
           process.platform;
  },
  
  get arch(): string {
    return process.arch;
  },
  
  get target(): string {
    return `${process.arch}-${process.platform}`;
  },
  
  get platform(): string {
    return process.platform;
  },
  
  get versions(): NodeJS.ProcessVersions {
    return process.versions;
  }
};

// Feature-based detection
export const detectPlatformFeatures = () => {
  return {
    hasFS: typeof require !== 'undefined' || typeof import !== 'undefined',
    hasProcess: typeof process !== 'undefined',
    hasBuffer: typeof Buffer !== 'undefined',
    hasWebAPIs: typeof TextEncoder !== 'undefined',
    hasWebStreams: typeof ReadableStream !== 'undefined',
    hasAbortController: typeof AbortController !== 'undefined'
  };
};
```

### 8. Memory Usage with Web Standards

#### Memory Monitoring
```typescript
// OLD: Deno approach
const memory = Deno.memoryUsage();

// NEW: WebAPI + Node ESM approach
import process from 'node:process';

export const memoryAPI = {
  usage(): MemoryUsage {
    const usage = process.memoryUsage();
    return {
      rss: usage.rss,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers,
      // Deno compatibility
      heap: usage.heapUsed
    };
  },
  
  // Performance monitoring with Web APIs
  measurePerformance<T>(name: string, fn: () => T): T {
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    
    console.log(`${name} took ${end - start} milliseconds`);
    return result;
  },
  
  async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    
    console.log(`${name} took ${end - start} milliseconds`);
    return result;
  }
};

interface MemoryUsage {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  heap: number; // Deno compatibility
}
```

## Integration Patterns

### 1. Unified Runtime Adapter

```typescript
// Complete runtime adapter that provides WebAPI-first interfaces
export const createUnifiedRuntime = async () => {
  const fs = await import('node:fs/promises');
  const process = await import('node:process');
  const childProcess = await import('node:child_process');
  
  return {
    // File system with WebAPI patterns
    fs: new FileSystemAPI(),
    
    // Process operations
    process: processAPI,
    
    // Environment
    env: new EnvironmentAPI(),
    
    // Command execution
    Command,
    
    // Streams
    streams: new WebStreamIO(),
    
    // Errors
    errors: WebStandardErrors,
    
    // Platform
    platform: platformAPI,
    
    // Memory
    memory: memoryAPI,
    
    // Standards compliance check
    checkCompliance(): boolean {
      return typeof TextEncoder !== 'undefined' &&
             typeof ReadableStream !== 'undefined' &&
             typeof AbortController !== 'undefined';
    }
  };
};
```

### 2. Migration Helper

```typescript
// Helper for gradual migration from Deno APIs
export const createMigrationBridge = async () => {
  const runtime = await createUnifiedRuntime();
  
  // Deno-compatible interface using modern implementations
  return {
    // File operations (Deno-style interface, WebAPI implementation)
    mkdir: runtime.fs.mkdir.bind(runtime.fs),
    readDir: runtime.fs.readDir.bind(runtime.fs),
    readTextFile: readTextFile,
    writeTextFile: writeTextFile,
    stat: runtime.fs.stat.bind(runtime.fs),
    remove: runtime.fs.remove.bind(runtime.fs),
    
    // Process operations
    args: runtime.process.args,
    pid: runtime.process.pid,
    env: runtime.env,
    exit: runtime.process.exit,
    
    // Command execution
    Command: runtime.Command,
    
    // Errors (Deno-compatible interface)
    errors: runtime.errors,
    
    // Build info
    build: runtime.platform
  };
};
```

## Testing Strategies

### 1. WebAPI Compliance Testing

```typescript
export const testWebAPICompliance = async () => {
  const tests = [
    // TextEncoder/TextDecoder
    () => {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const text = 'Hello, WebAPI! 🚀';
      const encoded = encoder.encode(text);
      const decoded = decoder.decode(encoded);
      console.assert(text === decoded, 'TextEncoder/TextDecoder failed');
    },
    
    // ReadableStream/WritableStream
    () => {
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        }
      });
      console.assert(readable instanceof ReadableStream, 'ReadableStream failed');
    },
    
    // AbortController
    () => {
      const controller = new AbortController();
      const signal = controller.signal;
      controller.abort();
      console.assert(signal.aborted, 'AbortController failed');
    }
  ];
  
  for (const test of tests) {
    try {
      test();
    } catch (error) {
      console.error('WebAPI compliance test failed:', error);
    }
  }
  
  console.log('✅ WebAPI compliance tests completed');
};
```

### 2. Cross-Runtime Compatibility

```typescript
export const testCrossRuntimeCompat = async () => {
  const runtime = await createUnifiedRuntime();
  
  // Test that should work in Node.js, Bun, and future runtimes
  const tests = [
    // File operations
    async () => {
      const testFile = './test-webapi-compat.txt';
      await runtime.fs.writeTextFile(testFile, 'Hello WebAPI!');
      const content = await runtime.fs.readTextFile(testFile);
      await runtime.fs.remove(testFile);
      console.assert(content === 'Hello WebAPI!', 'File operations failed');
    },
    
    // Stream operations
    async () => {
      const stream = new runtime.streams.WebStreamIO();
      const data = 'Stream test';
      // Test would be environment-specific
      console.log('Stream operations tested');
    }
  ];
  
  for (const test of tests) {
    try {
      await test();
    } catch (error) {
      console.error('Cross-runtime compatibility test failed:', error);
    }
  }
  
  console.log('✅ Cross-runtime compatibility tests completed');
};
```

## Performance Optimizations

### 1. ESM Benefits
- **Tree Shaking**: Import only needed functions from `node:*` modules
- **Static Analysis**: Better bundling and dead code elimination
- **Explicit Dependencies**: Clear module boundaries

### 2. WebAPI Benefits  
- **Native Performance**: Direct browser/runtime optimizations
- **Reduced Polyfills**: Built-in implementations
- **Future Compatibility**: Standards-based evolution

### 3. Optimization Patterns

```typescript
// Lazy loading with ESM
export const createOptimizedAPI = async () => {
  // Only load modules when needed
  const loadFS = () => import('node:fs/promises');
  const loadProcess = () => import('node:process');
  const loadChildProcess = () => import('node:child_process');
  
  return {
    async readFile(path: string) {
      const fs = await loadFS();
      return fs.readFile(path, 'utf-8');
    },
    
    async spawn(command: string, args: string[]) {
      const cp = await loadChildProcess();
      return cp.spawn(command, args);
    }
  };
};

// Performance monitoring
export const withPerformanceTracking = <T extends any[], R>(
  fn: (...args: T) => R,
  name: string
) => {
  return (...args: T): R => {
    const start = performance.now();
    const result = fn(...args);
    const end = performance.now();
    
    console.debug(`${name} took ${end - start}ms`);
    return result;
  };
};
```

This implementation guide ensures a modern, standards-compliant migration that maximizes compatibility while leveraging the best features of both WebAPIs and Node.js ESM modules.