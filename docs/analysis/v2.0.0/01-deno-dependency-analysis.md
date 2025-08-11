# Deno Dependency Analysis Report

## Executive Summary

This report analyzes all Deno framework dependencies within the `/src` directory of the claude-flow project and provides a comprehensive plan for their removal and replacement with modern TypeScript WebAPIs and Node.js ESM `node:*` modules.

### Key Findings

- **28 files** contain Deno API usage across multiple modules
- **No external Deno dependencies** from JSR or deno.land
- **Existing Node.js compatibility layer** provides foundation for WebAPI migration
- **Runtime detection layer** can be modernized to TypeScript standards

## Deno API Usage Categories

### 1. File System Operations (Most Common)
- `Deno.mkdir()` - Directory creation
- `Deno.readDir()` - Directory reading  
- `Deno.stat()` - File/directory statistics
- `Deno.readFile()`, `Deno.writeTextFile()` - File I/O
- `Deno.copyFile()` - File copying
- `Deno.remove()` - File/directory removal
- `Deno.chmod()` - Permission changes

### 2. Process and System Operations  
- `Deno.Command` - External command execution
- `Deno.args` - Command line arguments
- `Deno.pid` - Process ID
- `Deno.exit()` - Process termination
- `Deno.kill()` - Process killing

### 3. I/O Stream Operations
- `Deno.stdin`, `Deno.stdout`, `Deno.stderr` - Standard streams
- `Deno.stdin.read()`, `Deno.stdout.write()` - Stream operations

### 4. System Information
- `Deno.env.toObject()` - Environment variables
- `Deno.build.os`, `Deno.build.arch` - Platform info
- `Deno.memoryUsage()` - Memory statistics

### 5. Signal Handling
- `Deno.addSignalListener()` - Signal event handling

### 6. Error Types
- `Deno.errors.NotFound`
- `Deno.errors.AlreadyExists`
- `Deno.errors.PermissionDenied`

## Files with Deno Dependencies

### Core CLI Files (High Priority)
1. `src/cli/index.ts` - Main CLI entry point
2. `src/cli/simple-cli.ts` - Simplified CLI interface
3. `src/cli/index-remote.ts` - Remote CLI functionality
4. `src/cli/completion.ts` - Command completion
5. `src/cli/runtime-detector.js` - Runtime detection (uses Deno APIs)

### Command Implementations
6. `src/cli/commands/swarm.ts` - Swarm management
7. `src/cli/commands/monitor.ts` - System monitoring
8. `src/cli/commands/start/process-manager.ts` - Process management
9. `src/cli/commands/start/start-command.ts` - Start command
10. `src/cli/commands/start/process-ui-simple.ts` - UI processes

### Coordination and Swarm
11. `src/swarm/coordinator.ts` - Main swarm coordinator (heavy Deno usage)

### Validation and Initialization
12-18. Various validation and initialization scripts in `src/cli/simple-commands/init/`

### Utilities
19. `src/utils/npx-isolated-cache.js` - NPX cache management
20. `src/cli/node-compat.js` - Node.js compatibility layer (references Deno)

## Existing Migration Infrastructure

### Advantages
- **Runtime Detection**: `src/cli/runtime-detector.js` already provides cross-platform compatibility
- **Node.js Compatibility Layer**: `src/cli/node-compat.js` provides Node.js equivalents for Deno APIs
- **Unified Terminal I/O**: Cross-platform terminal handling already implemented

### Current Compatibility Strategy
The codebase already implements a dual-runtime strategy:
```javascript
const isDeno = typeof Deno !== 'undefined';
const isNode = typeof process !== 'undefined';
```

## Migration Complexity Assessment

### Low Complexity (Direct Replacement)
- File system operations → Node.js `fs/promises`
- Process operations → Node.js `process`
- Command execution → Node.js `child_process`

### Medium Complexity (Requires Adaptation)  
- Stream operations → Node.js streams with different APIs
- Signal handling → Node.js `process.on()`
- Memory usage → Node.js `process.memoryUsage()`

### High Complexity (Architecture Changes)
- Runtime detection logic in multiple files
- Cross-platform compatibility testing
- Error handling type changes

## Risk Assessment

### Low Risk
- Most Deno APIs have direct Node.js equivalents
- Existing compatibility layer reduces migration effort
- No external Deno dependencies to replace

### Medium Risk  
- Testing cross-platform compatibility
- Potential breaking changes in CLI behavior
- Stream handling differences between runtimes

### High Risk
- Files with heavy Deno usage (e.g., `swarm/coordinator.ts`)
- Complex validation and initialization scripts
- Potential performance differences

## Recommended Migration Strategy

### Phase 1: Preparation (1-2 days)
1. Enhance existing Node.js compatibility layer
2. Create comprehensive test suite
3. Update build and development tooling

### Phase 2: Core Migration (3-5 days)
1. Replace Deno APIs with Node.js equivalents
2. Update runtime detection logic  
3. Modify error handling patterns

### Phase 3: Validation (2-3 days)
1. Comprehensive testing on all platforms
2. Performance benchmarking
3. Documentation updates

### Phase 4: Cleanup (1 day)
1. Remove Deno-specific code and dependencies
2. Update configuration files
3. Final verification

## Next Steps

1. Review detailed API mapping in `02-api-mapping-guide.md`
2. Follow step-by-step migration plan in `03-migration-steps.md`
3. Implement Node.js alternatives using `04-nodejs-migration-guide.md`
4. Execute comprehensive removal plan from `05-comprehensive-removal-plan.md`