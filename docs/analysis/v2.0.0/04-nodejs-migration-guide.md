# Node.js Migration Implementation Guide

## Overview

This guide provides detailed implementation examples for migrating from Deno APIs to Node.js alternatives, with focus on maintaining functionality and performance.

## File System Operations Migration

### Directory Operations

#### Creating Directories
```javascript
// BEFORE (Deno)
await Deno.mkdir(projectDir, { recursive: true });

// AFTER (Node.js)
import { mkdir } from 'fs/promises';
await mkdir(projectDir, { recursive: true });

// Error handling variant
try {
  await mkdir(projectDir, { recursive: true });
} catch (error) {
  if (error.code !== 'EEXIST') {
    throw error;
  }
}
```

#### Reading Directories
```javascript
// BEFORE (Deno)
for await (const entry of Deno.readDir(dir)) {
  if (entry.isFile) {
    console.log(`File: ${entry.name}`);
  }
}

// AFTER (Node.js)
import { readdir } from 'fs/promises';

const entries = await readdir(dir, { withFileTypes: true });
for (const entry of entries) {
  if (entry.isFile()) {
    console.log(`File: ${entry.name}`);
  }
}

// Helper function for compatibility
export const readDirCompat = async (path) => {
  const entries = await readdir(path, { withFileTypes: true });
  return entries.map(entry => ({
    name: entry.name,
    isFile: entry.isFile(),
    isDirectory: entry.isDirectory(),
    isSymlink: entry.isSymbolicLink()
  }));
};
```

#### Removing Files and Directories
```javascript
// BEFORE (Deno)
await Deno.remove(path, { recursive: true });

// AFTER (Node.js)
import { rm } from 'fs/promises';
await rm(path, { recursive: true, force: true });

// Backwards compatibility for older Node.js versions
import { rmdir, unlink, stat } from 'fs/promises';

export const removeCompat = async (path, options = {}) => {
  try {
    if (options.recursive) {
      await rm(path, { recursive: true, force: true });
    } else {
      const stats = await stat(path);
      if (stats.isDirectory()) {
        await rmdir(path);
      } else {
        await unlink(path);
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT' || !options.force) {
      throw error;
    }
  }
};
```

### File Operations

#### Reading and Writing Files
```javascript
// BEFORE (Deno)
const content = await Deno.readTextFile(filePath);
await Deno.writeTextFile(filePath, content);

// AFTER (Node.js)
import { readFile, writeFile } from 'fs/promises';

const content = await readFile(filePath, 'utf-8');
await writeFile(filePath, content, 'utf-8');

// With error handling
export const readTextFileCompat = async (path) => {
  try {
    return await readFile(path, 'utf-8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`File not found: ${path}`);
    }
    throw error;
  }
};
```

#### File Statistics
```javascript
// BEFORE (Deno)  
const info = await Deno.stat(path);
if (info.isFile) {
  console.log(`Size: ${info.size}`);
}

// AFTER (Node.js)
import { stat } from 'fs/promises';

const info = await stat(path);
if (info.isFile()) {
  console.log(`Size: ${info.size}`);
}

// Compatibility wrapper
export const statCompat = async (path) => {
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

## Process Operations Migration

### Command Execution

#### Simple Command Execution
```javascript
// BEFORE (Deno)
const command = new Deno.Command('node', {
  args: ['--version'],
  env: Deno.env.toObject()
});
const result = await command.output();

// AFTER (Node.js) - Create reusable Command class
import { spawn } from 'child_process';

export class Command {
  constructor(command, options = {}) {
    this.command = command;
    this.options = {
      args: options.args || [],
      cwd: options.cwd,
      env: options.env || process.env,
      stdin: options.stdin || 'null',
      stdout: options.stdout || 'piped',
      stderr: options.stderr || 'piped'
    };
  }

  async output() {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, this.options.args, {
        cwd: this.options.cwd,
        env: this.options.env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = [];
      let stderr = [];

      if (child.stdout) {
        child.stdout.on('data', data => stdout.push(data));
      }
      
      if (child.stderr) {
        child.stderr.on('data', data => stderr.push(data));
      }

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
  }

  spawn() {
    const child = spawn(this.command, this.options.args, {
      cwd: this.options.cwd,
      env: this.options.env,
      stdio: this.options.stdio === 'inherit' ? 'inherit' : 'pipe'
    });

    return {
      status: new Promise(resolve => {
        child.on('close', code => {
          resolve({ code, success: code === 0 });
        });
      }),
      stdout: child.stdout,
      stderr: child.stderr,
      stdin: child.stdin,
      kill: signal => child.kill(signal),
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

### Process Control

#### Signal Handling
```javascript
// BEFORE (Deno)
Deno.addSignalListener('SIGINT', gracefulShutdown);
Deno.addSignalListener('SIGTERM', gracefulShutdown);

// AFTER (Node.js)
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Compatibility wrapper
export const addSignalListener = (signal, handler) => {
  process.on(signal, handler);
};

// Multiple signal helper
export const addSignalListeners = (signals, handler) => {
  signals.forEach(signal => process.on(signal, handler));
};

// Usage
addSignalListeners(['SIGINT', 'SIGTERM'], gracefulShutdown);
```

#### Process Information
```javascript
// BEFORE (Deno)
const processId = Deno.pid;
Deno.kill(pid, 'SIGTERM');
Deno.exit(0);

// AFTER (Node.js)
const processId = process.pid;
process.kill(pid, 'SIGTERM');
process.exit(0);

// Compatibility exports
export const pid = process.pid;
export const kill = process.kill;
export const exit = process.exit;
```

## Stream I/O Migration

### Standard Input/Output Operations
```javascript
// BEFORE (Deno)
const encoder = new TextEncoder();
const decoder = new TextDecoder();

await Deno.stdout.write(encoder.encode(prompt));
const buf = new Uint8Array(1024);
const n = await Deno.stdin.read(buf);
const input = decoder.decode(buf.subarray(0, n));

// AFTER (Node.js) - Create StreamIO class
export class StreamIO {
  constructor() {
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();
  }

  async writeStdout(data) {
    if (typeof data === 'string') {
      data = this.encoder.encode(data);
    }
    
    return new Promise((resolve, reject) => {
      process.stdout.write(data, (err) => {
        if (err) reject(err);
        else resolve(data.length);
      });
    });
  }

  async writeStderr(data) {
    if (typeof data === 'string') {
      data = this.encoder.encode(data);
    }
    
    return new Promise((resolve, reject) => {
      process.stderr.write(data, (err) => {
        if (err) reject(err);
        else resolve(data.length);
      });
    });
  }

  async readStdin(buffer) {
    return new Promise((resolve) => {
      const wasRaw = process.stdin.isRaw;
      
      if (process.stdin.isTTY && !wasRaw) {
        process.stdin.setRawMode(true);
      }
      
      process.stdin.resume();
      
      process.stdin.once('data', (data) => {
        const bytes = Math.min(data.length, buffer.length);
        buffer.set(data.slice(0, bytes));
        
        if (process.stdin.isTTY && !wasRaw) {
          process.stdin.setRawMode(false);
        }
        
        process.stdin.pause();
        resolve(bytes);
      });
    });
  }

  async readLine() {
    return new Promise((resolve) => {
      process.stdin.resume();
      process.stdin.once('data', (data) => {
        const line = data.toString().trim();
        process.stdin.pause();
        resolve(line);
      });
    });
  }
}

// Usage
const streamIO = new StreamIO();
await streamIO.writeStdout('Enter command: ');
const buffer = new Uint8Array(1024);
const bytesRead = await streamIO.readStdin(buffer);
const input = new TextDecoder().decode(buffer.subarray(0, bytesRead));
```

## Environment and System Information

### Environment Variables
```javascript
// BEFORE (Deno)
const env = Deno.env.toObject();
const path = Deno.env.get('PATH');

// AFTER (Node.js)
const env = { ...process.env };
const path = process.env.PATH;

// Compatibility wrapper
export const env = {
  get: (key) => process.env[key],
  set: (key, value) => {
    process.env[key] = value;
  },
  delete: (key) => {
    delete process.env[key];
  },
  toObject: () => ({ ...process.env }),
  has: (key) => key in process.env
};
```

### Platform Information
```javascript
// BEFORE (Deno)
const os = Deno.build.os;
const arch = Deno.build.arch;
const target = Deno.build.target;

// AFTER (Node.js)
const build = {
  os: process.platform === 'win32' ? 'windows' :
      process.platform === 'darwin' ? 'darwin' :
      process.platform === 'linux' ? 'linux' : 
      process.platform,
  arch: process.arch,
  target: `${process.arch}-${process.platform}`
};

// Compatibility export
export { build };
```

### Memory Usage
```javascript
// BEFORE (Deno)
const memory = Deno.memoryUsage();
console.log(`RSS: ${memory.rss}, Heap: ${memory.heapUsed}`);

// AFTER (Node.js)
const memoryUsage = () => {
  const usage = process.memoryUsage();
  return {
    rss: usage.rss,
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    // Add Deno-compatible property names if needed
    heap: usage.heapUsed
  };
};

export { memoryUsage };

// Usage
const memory = memoryUsage();
console.log(`RSS: ${memory.rss}, Heap: ${memory.heapUsed}`);
```

## Error Handling Migration

### Custom Error Classes
```javascript
// BEFORE (Deno)
if (error instanceof Deno.errors.NotFound) {
  console.log('File not found');
} else if (error instanceof Deno.errors.AlreadyExists) {
  console.log('File already exists');
}

// AFTER (Node.js) - Create compatible error classes
export class DenoCompatErrors {
  static NotFound = class extends Error {
    constructor(message = 'Not found') {
      super(message);
      this.name = 'NotFound';
    }
  };

  static AlreadyExists = class extends Error {
    constructor(message = 'Already exists') {
      super(message);
      this.name = 'AlreadyExists';
    }
  };

  static PermissionDenied = class extends Error {
    constructor(message = 'Permission denied') {
      super(message);
      this.name = 'PermissionDenied';
    }
  };

  static BadResource = class extends Error {
    constructor(message = 'Bad resource') {
      super(message);
      this.name = 'BadResource';
    }
  };
}

// Export for compatibility
export const errors = DenoCompatErrors;

// Usage
try {
  await readFile('nonexistent.txt');
} catch (error) {
  if (error.code === 'ENOENT') {
    throw new errors.NotFound(`File not found: ${error.path}`);
  }
  throw error;
}
```

### Error Code Mapping
```javascript
// Map Node.js error codes to Deno-style errors
export const mapNodeError = (error) => {
  switch (error.code) {
    case 'ENOENT':
      return new errors.NotFound(error.message);
    case 'EEXIST':
      return new errors.AlreadyExists(error.message);
    case 'EACCES':
    case 'EPERM':
      return new errors.PermissionDenied(error.message);
    default:
      return error;
  }
};
```

## Runtime Detection Migration

### Unified Runtime Detection
```javascript
// BEFORE (Deno/Node dual support)
const isDeno = typeof Deno !== 'undefined';
const isNode = typeof process !== 'undefined' && process.versions?.node;
const runtime = isDeno ? 'deno' : isNode ? 'node' : 'unknown';

// AFTER (Node.js only)
const isDeno = false;
const isNode = true;
const runtime = 'node';

// Compatibility exports
export { isDeno, isNode, runtime };

// Runtime-specific initialization
export const initializeRuntime = () => {
  // Since we're Node.js only now, always initialize Node.js APIs
  return {
    runtime: 'node',
    fs: {
      mkdir: (await import('fs/promises')).mkdir,
      readdir: (await import('fs/promises')).readdir,
      readFile: (await import('fs/promises')).readFile,
      writeFile: (await import('fs/promises')).writeFile,
      stat: (await import('fs/promises')).stat,
      rm: (await import('fs/promises')).rm
    },
    process: {
      args: process.argv.slice(2),
      pid: process.pid,
      env: process.env,
      exit: process.exit,
      kill: process.kill
    },
    Command: Command, // Our custom Command class
    StreamIO: StreamIO // Our custom StreamIO class
  };
};
```

## Testing Migration

### Test Compatibility Layer
```javascript
// Test helper for verifying Node.js equivalents work the same as Deno
export const testApiEquivalence = async (description, denoCode, nodeCode) => {
  console.log(`Testing: ${description}`);
  
  // This would be used during migration development
  // to ensure both implementations produce the same results
  try {
    const denoResult = await denoCode();
    const nodeResult = await nodeCode();
    
    if (JSON.stringify(denoResult) === JSON.stringify(nodeResult)) {
      console.log('✅ APIs are equivalent');
    } else {
      console.log('❌ API results differ');
      console.log('Deno:', denoResult);
      console.log('Node:', nodeResult);
    }
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
};

// Example usage during migration
await testApiEquivalence(
  'Directory reading',
  async () => {
    const entries = [];
    for await (const entry of Deno.readDir('./')) {
      entries.push({ name: entry.name, isFile: entry.isFile });
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  },
  async () => {
    const entries = await readdir('./', { withFileTypes: true });
    return entries
      .map(entry => ({ name: entry.name, isFile: entry.isFile() }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
);
```

## Performance Considerations

### Optimization Tips
1. **Buffer Reuse**: Reuse buffers for stream operations to reduce garbage collection
2. **Stream Handling**: Use Node.js streams efficiently for large file operations
3. **Process Spawning**: Consider using worker threads for CPU-intensive tasks
4. **Memory Management**: Monitor memory usage with `process.memoryUsage()`

### Performance Monitoring
```javascript
// Performance comparison helper
export const performanceTest = async (name, denoFn, nodeFn, iterations = 100) => {
  console.log(`Performance test: ${name}`);
  
  // Node.js version
  const nodeStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    await nodeFn();
  }
  const nodeEnd = performance.now();
  
  console.log(`Node.js: ${nodeEnd - nodeStart}ms`);
  console.log(`Average: ${(nodeEnd - nodeStart) / iterations}ms per operation`);
};
```

## Migration Validation

### Functionality Checklist
- [ ] File system operations work identically
- [ ] Process spawning produces same results
- [ ] Signal handling functions correctly
- [ ] Stream I/O maintains same behavior
- [ ] Error types and messages are consistent
- [ ] Performance is within acceptable range
- [ ] Cross-platform compatibility maintained

### Integration Testing
```javascript
// Integration test for key workflows
export const testKeyWorkflows = async () => {
  const tests = [
    {
      name: 'CLI initialization',
      test: async () => {
        // Test CLI starts and responds correctly
        const command = new Command('node', { args: ['dist/cli/index.js', '--help'] });
        const result = await command.output();
        return result.success && result.stdout.toString().includes('Usage:');
      }
    },
    {
      name: 'File operations',
      test: async () => {
        // Test file creation, reading, deletion
        const testFile = './test-migration.txt';
        await writeFile(testFile, 'test content');
        const content = await readFile(testFile, 'utf-8');
        await rm(testFile);
        return content === 'test content';
      }
    }
    // Add more workflow tests...
  ];

  for (const test of tests) {
    try {
      const passed = await test.test();
      console.log(`${passed ? '✅' : '❌'} ${test.name}`);
    } catch (error) {
      console.log(`❌ ${test.name}: ${error.message}`);
    }
  }
};
```

This guide provides the foundation for implementing a complete Deno to Node.js migration while maintaining functionality, performance, and compatibility across platforms.