# Deno to WebAPIs and Node.js ESM Migration Steps

## Pre-Migration Checklist

### 1. Backup Current State
```bash
# Create backup branch
git checkout -b backup/pre-deno-migration
git push origin backup/pre-deno-migration

# Create backup of key files
cp -r src/ src-backup-$(date +%Y%m%d)
```

### 2. Environment Setup
```bash
# Ensure Node.js 18+ is installed (for WebAPI and ESM support)
node --version

# Verify ESM and WebAPI support
node -e "console.log(!!globalThis.TextEncoder && !!globalThis.ReadableStream)"

# Install required dependencies
npm install
npm run build

# Run current tests to establish baseline
npm test
```

### 3. Create Migration Branch
```bash
git checkout -b feature/migrate-to-webapis-esm
```

## Phase 1: Create WebAPI Compatibility Layer (Day 1)

### Step 1.1: Create WebAPI Compatibility Layer
**New File**: `src/utils/webapi-compat.ts`

```typescript
// Modern WebAPI + Node ESM compatibility layer
import { mkdir, readdir, readFile, writeFile, stat, rm, copyFile, chmod } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import process from 'node:process';

// File System Operations (WebAPI style)
export const webApiFS = {
  mkdir: async (path: string, options?: { recursive?: boolean }) => {
    return mkdir(path, { recursive: options?.recursive });
  },

  readDir: async (path: string) => {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.map(entry => ({
      name: entry.name,
      isFile: entry.isFile(),
      isDirectory: entry.isDirectory(),
      isSymlink: entry.isSymbolicLink()
    }));
  },

  readTextFile: async (path: string): Promise<string> => {
    const buffer = await readFile(path);
    return new TextDecoder().decode(buffer);
  },

  writeTextFile: async (path: string, content: string): Promise<void> => {
    const encoded = new TextEncoder().encode(content);
    await writeFile(path, encoded);
  },

  stat: async (path: string) => {
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
  },

  remove: async (path: string, options?: { recursive?: boolean }) => {
    return rm(path, { recursive: options?.recursive, force: true });
  },

  copyFile: async (src: string, dest: string) => {
    return copyFile(src, dest);
  },

  chmod: async (path: string, mode: number) => {
    return chmod(path, mode);
  }
};

// Process Operations (WebAPI style)
export const webApiProcess = {
  args: process.argv.slice(2),
  pid: process.pid,
  env: {
    get: (key: string) => process.env[key],
    set: (key: string, value: string) => { process.env[key] = value; },
    toObject: () => ({ ...process.env }),
    has: (key: string) => key in process.env
  },
  build: {
    os: process.platform === 'win32' ? 'windows' : 
        process.platform === 'darwin' ? 'darwin' :
        process.platform === 'linux' ? 'linux' : process.platform,
    arch: process.arch,
    target: `${process.arch}-${process.platform}`
  },
  memoryUsage: () => {
    const usage = process.memoryUsage();
    return {
      rss: usage.rss,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      heap: usage.heapUsed // Deno compatibility
    };
  },
  exit: (code?: number) => process.exit(code),
  kill: (pid: number, signal?: NodeJS.Signals) => process.kill(pid, signal)
};

// Signal Handling (WebAPI style) 
export const addSignalListener = (signal: NodeJS.Signals, handler: () => void) => {
  process.on(signal, handler);
};

// Command Execution (Standards-compliant)
export class Command {
  constructor(
    private command: string,
    private options: {
      args?: string[];
      cwd?: string;
      env?: Record<string, string>;
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
}
```

### Step 1.2: Create Command Execution Helper
**New File**: `src/utils/command-executor.js`

```javascript
import { spawn } from 'child_process';

export class CommandExecutor {
  constructor(command, options = {}) {
    this.command = command;
    this.options = options;
  }

  async output() {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, this.options.args || [], {
        cwd: this.options.cwd,
        env: this.options.env || process.env,
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
  }

  spawn() {
    const child = spawn(this.command, this.options.args || [], {
      cwd: this.options.cwd,
      env: this.options.env || process.env,
      stdio: this.options.stdio || 'inherit'
    });

    return {
      status: new Promise(resolve => {
        child.on('close', code => {
          resolve({ code, success: code === 0 });
        });
      }),
      stdout: child.stdout,
      stderr: child.stderr,
      kill: signal => child.kill(signal)
    };
  }
}
```

### Step 1.3: Create Stream I/O Helper
**New File**: `src/utils/stream-io.js`

```javascript
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

  async readStdin(buffer) {
    return new Promise(resolve => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();
      process.stdin.once('data', data => {
        const bytes = Math.min(data.length, buffer.length);
        buffer.set(data.slice(0, bytes));
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdin.pause();
        resolve(bytes);
      });
    });
  }
}
```

## Phase 2: Core File Migration (Days 2-4)

### Step 2.1: Update Runtime Detection
**File**: `src/cli/runtime-detector.js`

Replace Deno-specific code:
```javascript
// Remove all Deno references
const isNode = true;
const isDeno = false;
const runtime = 'node';

// Update all conditionals
if (runtime === 'node') {
  // Use Node.js APIs directly
  stdin = process.stdin;
  stdout = process.stdout;
  stderr = process.stderr;
  exit = process.exit;
  pid = process.pid;
  addSignalListener = (signal, handler) => process.on(signal, handler);
}
```

### Step 2.2: Migrate CLI Entry Points

#### File: `src/cli/index.ts`
```typescript
// Replace
// Deno.addSignalListener('SIGINT', gracefulShutdown);
// With
process.on('SIGINT', gracefulShutdown);

// Replace  
// const args = Deno.args;
// With
const args = process.argv.slice(2);
```

#### File: `src/cli/simple-cli.ts`
```typescript
// Replace all Deno.* calls with Node.js equivalents
import { mkdir, rm } from 'fs/promises';
import { CommandExecutor } from '../utils/command-executor.js';
import { StreamIO } from '../utils/stream-io.js';

// Update command execution
// const command = new Deno.Command('claude', {...});
// becomes
const command = new CommandExecutor('claude', {...});

// Update directory operations
// await Deno.mkdir(dir, { recursive: true });
// becomes
await mkdir(dir, { recursive: true });

// Update I/O operations
const streamIO = new StreamIO();
// await Deno.stdout.write(encoder.encode(prompt));
await streamIO.writeStdout(prompt);
```

### Step 2.3: Migrate Swarm Coordinator
**File**: `src/swarm/coordinator.ts` (Highest priority - 12 Deno API calls)

```typescript
import { mkdir } from 'fs/promises';
import { CommandExecutor } from '../utils/command-executor.js';

// Replace all instances of:
// await Deno.mkdir(targetDir, { recursive: true });
await mkdir(targetDir, { recursive: true });

// const command = new Deno.Command('which', { ... });
const command = new CommandExecutor('which', { ... });

// const checkCommand = new Deno.Command('claude', { ... });
const checkCommand = new CommandExecutor('claude', { ... });

// Update environment handling
// ...Deno.env.toObject()
{ ...process.env }
```

### Step 2.4: Migrate Command Files

Process each command file systematically:

1. **`src/cli/commands/swarm.ts`**
2. **`src/cli/commands/monitor.ts`**  
3. **`src/cli/commands/start/start-command.ts`**
4. **`src/cli/commands/start/process-manager.ts`**
5. **`src/cli/commands/start/process-ui-simple.ts`**

Common patterns to replace:
```typescript
// File operations
await mkdir(path, { recursive: true });  // instead of Deno.mkdir
await rm(path, { recursive: true });     // instead of Deno.remove

// Process operations  
process.pid;                             // instead of Deno.pid
process.kill(pid, signal);               // instead of Deno.kill
process.exit(code);                      // instead of Deno.exit

// Signal handling
process.on('SIGINT', handler);           // instead of Deno.addSignalListener
```

## Phase 3: Validation and Testing (Days 5-6)

### Step 3.1: Update Test Files
Update any tests that reference Deno:
```bash
find tests/ -name "*.js" -o -name "*.ts" | xargs grep -l "Deno\." 
```

### Step 3.2: Run Test Suite
```bash
# Run full test suite
npm test

# Run specific CLI tests
npm run test:cli

# Run integration tests
npm run test:integration
```

### Step 3.3: Manual Testing Checklist

#### CLI Commands
- [ ] `npx claude-flow init`
- [ ] `npx claude-flow start`  
- [ ] `npx claude-flow swarm init`
- [ ] `npx claude-flow hive-mind init`
- [ ] `npx claude-flow status`

#### Cross-Platform Testing
- [ ] Linux (Ubuntu/Debian)
- [ ] macOS  
- [ ] Windows (with WSL)
- [ ] Windows (native)

#### Feature Testing
- [ ] File operations work correctly
- [ ] Process spawning functions
- [ ] Signal handling works
- [ ] Stream I/O functions properly
- [ ] Error handling maintained

### Step 3.4: Performance Benchmarking
```bash
# Run performance tests before/after
npm run benchmark

# Memory usage comparison
npm run test:memory

# CLI responsiveness test
time npx claude-flow --help
```

## Phase 4: Cleanup and Finalization (Day 7)

### Step 4.1: Remove Deno References
```bash
# Search for remaining Deno references
grep -r "Deno\." src/ --include="*.js" --include="*.ts"

# Remove any unused compatibility code
# Clean up imports that are no longer needed
```

### Step 4.2: Update Configuration Files

#### Update `package.json` 
Remove any Deno-related scripts or dependencies.

#### Update Documentation
- Update README.md installation instructions
- Update API documentation  
- Update troubleshooting guides

### Step 4.3: Final Verification
```bash
# Build the project
npm run build

# Run full test suite
npm test

# Check for any remaining issues
npm run lint
npm run type-check

# Test npm package functionality  
npm pack
npm install -g claude-flow-*.tgz
claude-flow --version
```

## Rollback Plan

If issues are encountered:

### Quick Rollback
```bash
git checkout backup/pre-deno-migration
npm install
npm run build
```

### Partial Rollback
```bash
# Revert specific files
git checkout HEAD~1 -- src/cli/index.ts
git checkout HEAD~1 -- src/swarm/coordinator.ts
```

### Emergency Rollback
```bash
# Restore from backup directory
rm -rf src/
mv src-backup-$(date +%Y%m%d) src/
npm install
npm run build
```

## Success Criteria

- [ ] All tests pass
- [ ] No Deno references remain in src/
- [ ] CLI functionality preserved  
- [ ] Cross-platform compatibility maintained
- [ ] Performance within 5% of baseline
- [ ] Documentation updated
- [ ] Team review completed

## Risk Mitigation

### High-Risk Files
Monitor these files closely during migration:
1. `src/swarm/coordinator.ts` - Heavy Deno usage
2. `src/cli/simple-cli.ts` - Complex CLI logic
3. Initialization scripts - Platform-specific operations

### Testing Strategy
1. Run tests after each file migration
2. Use feature flags to enable/disable new code
3. Keep old and new implementations side-by-side initially
4. Gradual rollout with monitoring

## Post-Migration Tasks

1. **Performance Monitoring**: Track CLI responsiveness and memory usage
2. **User Feedback**: Monitor GitHub issues for migration-related problems  
3. **Documentation**: Update guides and examples
4. **CI/CD**: Ensure build processes work correctly
5. **Release**: Plan coordinated release with proper versioning

## Emergency Contacts

- **Primary**: Development team lead
- **Secondary**: DevOps/Infrastructure team  
- **Escalation**: Project maintainers

---

**Note**: This migration plan should be executed methodically with frequent commits and testing at each step. Do not proceed to the next phase until the current phase is fully validated.