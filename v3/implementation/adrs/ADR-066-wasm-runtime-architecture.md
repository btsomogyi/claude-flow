# ADR-066: WASM Runtime Architecture for Multi-Language AST Engines

**Status:** Proposed
**Date:** 2026-03-20
**Author:** System Architecture Designer
**Depends on:** ADR-026 (Agent Booster Model Routing), Task #4 (Language Provider Interface), Task #6 (Transform DSL)

## Context

The redesigned Agent Booster needs to run AST engines for multiple languages (Go, Rust, TypeScript, extensible) as WASM modules. The current Agent Booster (v2) uses a simulated MCP bridge to an external `agentic-flow` package. The redesigned system must:

1. Host language-specific AST parsers/transformers as isolated WASM plugins
2. Maintain the <1ms latency target for cached module invocations
3. Support extensibility -- third parties can write new language providers
4. Provide memory-safe, sandboxed execution with no network access
5. Work in Node.js (primary), browsers (secondary), and edge runtimes (future)

## Decision

### Runtime Selection: V8 Built-in WebAssembly + Extism Plugin Framework

After evaluating the WASM runtime landscape, we select a **two-layer approach**:

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Execution** | V8 built-in `WebAssembly` API (Node.js) | Zero-overhead WASM execution, already available |
| **Plugin Framework** | Extism JS SDK (`@extism/extism`) | Plugin lifecycle, host functions, memory management |
| **Interface Definition** | WIT (WebAssembly Interface Types) via Jco | Type-safe plugin contracts, code generation |
| **Fallback** | Native Node.js modules | When WASM is unavailable or too slow |

### Why This Combination

**V8 Built-in (not wasmtime-js or wasmer-js)**
- Zero additional runtime overhead -- V8 is already present in Node.js
- JIT compilation with tiered optimization (Liftoff -> TurboFan)
- Code caching for compiled modules (near-instant re-instantiation)
- Best cold-start latency in Node.js context: no FFI bridge overhead
- 2026 benchmarks show V8 WASM within 1.5x of native for compute workloads

**Extism (not raw WebAssembly API)**
- Abstracts plugin lifecycle (load, call, teardown)
- Built-in host function linking for callbacks from guest to host
- Memory management utilities (no manual pointer arithmetic)
- Runtime limiters and timers (prevents runaway plugins)
- Uses V8's WebAssembly under the hood in Node.js (no separate runtime)
- Supports guest plugins written in Rust, Go, C, AssemblyScript, and JS/TS

**WIT via Jco (for future Component Model migration)**
- Jco 1.0 is stable (Bytecode Alliance) and generates TypeScript bindings
- WIT definitions serve as the contract between host and guest
- When WASI Preview 2 lands in Node.js, we can migrate to full components
- For now, WIT is used only for type generation, not runtime dispatch

### Why NOT Full WASI / Component Model Today

- Node.js still only supports WASI Preview 1 (unstable)
- WASI Preview 2 / Component Model requires Jco transpilation, adding startup cost
- The Component Model is Phase 2/3 in W3C -- not production-ready
- We define WIT interfaces now for forward compatibility, but execute via Extism

---

## Architecture

### System Overview

```
+------------------------------------------------------------------+
|                    Agent Booster Runtime                           |
|                                                                    |
|  +--------------------+    +----------------------------------+   |
|  |   Plugin Registry  |    |     Module Cache (LRU)           |   |
|  |                    |    |  - Compiled WASM bytecode         |   |
|  |  - bundled (TS,Go, |    |  - Pre-instantiated instances     |   |
|  |    Rust,tree-sitter)|   |  - V8 code cache artifacts        |   |
|  |  - CDN/registry    |    +----------------------------------+   |
|  |  - local .wasm     |                                           |
|  +--------------------+                                           |
|           |                                                        |
|           v                                                        |
|  +--------------------+    +----------------------------------+   |
|  |   Module Loader    |    |     Worker Pool                  |   |
|  |                    |    |                                    |   |
|  |  - Lazy loading    |--->|  Worker 0: [TS plugin instance]  |   |
|  |  - Integrity check |    |  Worker 1: [Go plugin instance]  |   |
|  |  - Compile & cache |    |  Worker 2: [Rust plugin inst.]   |   |
|  |  - Version check   |    |  Worker 3: (idle / on-demand)    |   |
|  +--------------------+    +----------------------------------+   |
|           |                          |                             |
|           v                          v                             |
|  +--------------------------------------------------+            |
|  |              Extism Host Runtime                   |            |
|  |                                                    |            |
|  |  - Plugin instantiation                           |            |
|  |  - Host function registry                         |            |
|  |  - Memory allocation / data passing               |            |
|  |  - Execution timeouts                             |            |
|  |  - Fuel metering (instruction limits)             |            |
|  +--------------------------------------------------+            |
|           |                                                        |
|           v                                                        |
|  +--------------------------------------------------+            |
|  |         V8 WebAssembly Engine                      |            |
|  |                                                    |            |
|  |  Liftoff (baseline)  ->  TurboFan (optimized)     |            |
|  |  Code caching         ->  Streaming compilation    |            |
|  +--------------------------------------------------+            |
+------------------------------------------------------------------+
```

### Plugin ABI (Application Binary Interface)

Each language provider WASM module exposes the following Extism plugin functions:

```wit
// language-provider.wit -- WIT interface definition

package agent-booster:language-provider@0.1.0;

interface provider {
    /// Metadata about the language provider
    record provider-info {
        name: string,
        version: string,
        languages: list<string>,
        capabilities: list<transform-capability>,
    }

    /// A parsed AST node (serialized)
    type ast-node = list<u8>;

    /// Transform capabilities this provider supports
    enum transform-capability {
        rename,
        add-node,
        remove-node,
        wrap-node,
        unwrap-node,
        move-node,
        replace-node,
        reorder,
    }

    /// Parse result
    record parse-result {
        ast: ast-node,
        diagnostics: list<diagnostic>,
        success: bool,
    }

    /// Transform result
    record transform-result {
        ast: ast-node,
        source: string,
        changes: list<text-change>,
        success: bool,
        diagnostics: list<diagnostic>,
    }

    /// A text change for incremental updates
    record text-change {
        start-offset: u32,
        end-offset: u32,
        new-text: string,
    }

    /// Diagnostic message
    record diagnostic {
        severity: diagnostic-severity,
        message: string,
        offset: u32,
        length: u32,
    }

    enum diagnostic-severity {
        error,
        warning,
        info,
    }

    /// Core plugin functions
    get-info: func() -> provider-info;
    parse: func(source: string, filename: string) -> parse-result;
    transform: func(ast: ast-node, instruction: list<u8>) -> transform-result;
    print: func(ast: ast-node) -> string;
    validate: func(source: string) -> list<diagnostic>;
}
```

### Data Serialization Strategy

| Data Type | Serialization | Rationale |
|-----------|--------------|-----------|
| AST nodes | MessagePack | 30-50% smaller than JSON, faster to encode/decode, schema-less |
| Transform instructions | MessagePack | Matches AST serialization, low overhead |
| Source code (input/output) | UTF-8 string via Extism memory | Zero-copy within WASM linear memory |
| Provider metadata | JSON | Human-readable, infrequent (once at load) |
| Error diagnostics | JSON | Human-readable, small payloads |

**Why MessagePack over JSON for AST data:**
- AST nodes can be large (10K+ nodes for a 1000-line file)
- MessagePack encoding is 2-5x faster than JSON.stringify
- MessagePack decoding is 2-3x faster than JSON.parse
- Binary format avoids UTF-8 encoding overhead for numeric/type data

**Why not custom binary format:**
- MessagePack has mature implementations in Rust (rmp), Go (msgpack), and JS (msgpackr)
- Easier debugging (can decode to inspect)
- Schema evolution is simpler

### Memory Management

```
Host (Node.js)                    Guest (WASM Plugin)
+-------------------+             +-------------------+
|                   |             |                   |
|  Source code      | -- copy --> |  Linear Memory    |
|  (JS string)     |             |  [0..N]: source   |
|                   |             |  [N..M]: AST      |
|                   |             |  [M..P]: output    |
|  Result           | <-- copy --+  [P..Q]: result    |
|  (JS string)     |             |                   |
+-------------------+             +-------------------+
```

**Strategy: Copy semantics with Extism-managed allocation**

1. **Input**: Source code is copied into WASM linear memory by Extism's `call()` method. Extism handles pointer management.
2. **Processing**: The guest allocates AST structures within its own linear memory. No host involvement needed.
3. **Output**: The guest writes results to Extism's output buffer. The host reads the result as a JS buffer.
4. **No SharedArrayBuffer**: We deliberately avoid SharedArrayBuffer because:
   - Extism does not support shared memory across plugins
   - WASM linear memory is already efficient for sequential parse->transform->print
   - SharedArrayBuffer requires COOP/COEP headers in browsers (deployment complexity)
   - The copy overhead for typical source files (<100KB) is <0.1ms

**Memory Growth Strategy:**
- Initial linear memory: 1MB (sufficient for files up to ~100KB)
- Maximum linear memory: 256MB (handles files up to ~50MB)
- Growth increment: 64KB pages (WASM standard)
- Host enforces per-plugin maximum via Extism configuration

### Module Loading Strategy

```
                First Use                    Subsequent Uses
                --------                     ----------------
  1. Check local cache                1. Check compiled cache
     |                                    |
     v (miss)                             v (hit)
  2. Check bundled modules            2. Instantiate from V8 code cache
     |                                    |
     v (miss)                             v
  3. Download from CDN/registry       3. Ready (<5ms)
     |
     v
  4. Verify integrity (SHA-256)
     |
     v
  5. Compile (V8 Liftoff: fast)
     |
     v
  6. Cache compiled artifact
     |
     v
  7. Instantiate
     |
     v
  8. Ready (<50ms first time)
```

**Bundled vs. Dynamic Modules:**

| Module | Distribution | Size (est.) | Rationale |
|--------|-------------|-------------|-----------|
| TypeScript provider | Bundled with CLI | ~2MB | Primary use case, must be instant |
| tree-sitter core | Bundled with CLI | ~500KB | Universal fallback parser |
| Go provider | Download on first use | ~3MB | Specialized, not always needed |
| Rust provider | Download on first use | ~4MB | Specialized, not always needed |
| Third-party providers | Download on install | Varies | Extensibility |

**Cache Hierarchy:**

```typescript
interface ModuleCache {
    // L1: In-memory pre-compiled WebAssembly.Module (instant)
    readonly compiled: Map<string, WebAssembly.Module>;

    // L2: On-disk V8 serialized code cache (fast re-compile)
    readonly diskCache: string; // ~/.cache/agent-booster/wasm/

    // L3: CDN/registry download
    readonly registryUrl: string;
}
```

**Startup Latency Budget:**

| Phase | First Use | Cached |
|-------|-----------|--------|
| Module lookup | <1ms | <1ms |
| Download (if needed) | 200-2000ms | 0ms |
| Integrity verification | <5ms | 0ms |
| V8 compilation (Liftoff) | 10-40ms | 0ms |
| V8 code cache restore | 0ms | 2-5ms |
| Extism instantiation | 5-10ms | 2-3ms |
| **Total** | **<50ms (bundled)** | **<5ms** |

### Concurrency Model

```
Main Thread (Agent Booster Core)
    |
    |-- Request: transform("file1.ts", instruction)
    |       |
    |       +-- Worker 0: TS plugin.transform()
    |
    |-- Request: transform("file2.go", instruction)  (parallel)
    |       |
    |       +-- Worker 1: Go plugin.transform()
    |
    |-- Request: transform("file3.rs", instruction)  (parallel)
    |       |
    |       +-- Worker 2: Rust plugin.transform()
    |
    +-- Await all results
```

**Worker Pool Design:**

```typescript
interface WorkerPoolConfig {
    // Minimum idle workers (pre-warmed with common plugins)
    minWorkers: 2;

    // Maximum concurrent workers
    maxWorkers: number; // Default: os.cpus().length

    // Worker idle timeout before teardown
    idleTimeoutMs: 30_000;

    // Per-worker memory limit
    workerMemoryLimitMB: 512;

    // Plugin pre-warming: which modules to load at startup
    preWarm: string[]; // Default: ['typescript']
}
```

**Implementation: Node.js `worker_threads`**

Each worker thread:
1. Creates its own Extism plugin instance (WASM modules are not shared across threads)
2. Maintains a local module cache (compiled modules CAN be transferred via `postMessage`)
3. Communicates with main thread via `MessagePort` (structured clone for results)
4. Has independent memory limits enforced by Extism

**Why `worker_threads` and not `cluster`:**
- worker_threads share the V8 isolate (lower memory per worker)
- Can transfer `WebAssembly.Module` via `postMessage` (avoids recompilation)
- Better suited for CPU-bound AST transformations than I/O-bound tasks

**Single-File Fast Path:**
For single-file transforms (the common case), skip worker dispatch entirely:
- Parse + transform + print runs on the main thread
- Only uses worker pool for batch operations (3+ files)
- Avoids ~0.5ms worker dispatch overhead

### Security Model

```
+--------------------------------------------+
|           Security Boundary                 |
|                                             |
|  WASM Sandbox (per plugin):                |
|  [x] Memory isolation (linear memory)      |
|  [x] No filesystem access                  |
|  [x] No network access                     |
|  [x] No process spawning                   |
|  [x] No environment variable access        |
|  [x] Instruction fuel metering             |
|  [x] Wall-clock timeout                    |
|  [x] Memory growth limit                   |
|                                             |
|  Host Function Allowlist:                   |
|  [x] log(level, message) -- structured log |
|  [x] read_file(path) -- sandboxed to       |
|      declared import paths only             |
|  [x] resolve_import(specifier) -- returns  |
|      pre-loaded dependency AST              |
|                                             |
|  NOT Allowed:                               |
|  [ ] Arbitrary file system access           |
|  [ ] Network requests                       |
|  [ ] Process execution                      |
|  [ ] Timer/setTimeout                       |
|  [ ] Shared memory across plugins           |
+--------------------------------------------+
```

**Extism Security Configuration:**

```typescript
const pluginConfig = {
    // Instruction fuel: max operations before abort
    fuel: 100_000_000, // ~100ms of compute at 1GHz

    // Wall-clock timeout
    timeoutMs: 5_000, // Hard kill after 5 seconds

    // Memory limits
    memory: {
        maxPages: 4096, // 256MB max linear memory
    },

    // No WASI capabilities (network, filesystem, etc.)
    wasi: false,

    // Only allow declared host functions
    allowedHostFunctions: ['log', 'read_file', 'resolve_import'],
};
```

**Sandboxed File Access for Import Resolution:**

Language providers like Go's `go/types` need to read imported packages. We solve this with a capability-based approach:

1. Before invoking a transform, the host pre-resolves all import paths
2. The host loads imported source files into a virtual filesystem (in-memory map)
3. The `read_file` host function only serves files from this pre-loaded map
4. The plugin cannot request arbitrary paths -- only paths the host pre-approved

```typescript
// Host prepares import context before calling plugin
const importContext = await resolveImports(sourceFile, language);
// importContext = Map<string, string> of path -> content

// Register host function with scoped access
plugin.registerHostFunction('read_file', (path: string) => {
    if (importContext.has(path)) {
        return importContext.get(path);
    }
    throw new Error(`Access denied: ${path} not in import scope`);
});
```

### Fallback Strategy

```
Attempt 1: WASM Plugin (Extism)
    |
    | (fail: module not found / compile error / timeout)
    v
Attempt 2: Native Node.js Module
    |   - tree-sitter node bindings
    |   - TypeScript compiler API (ts.createSourceFile)
    |   - SWC (native Rust via NAPI)
    |
    | (fail: native module not installed)
    v
Attempt 3: CLI Tool (npx)
    |   - npx oxc parse <file>
    |   - npx swc transform <file>
    |   - go ast-tool parse <file>
    |
    | (fail: CLI not available)
    v
Attempt 4: LLM (Tier 2/3 routing via ADR-026)
    |   - Route to Haiku (simple transforms)
    |   - Route to Sonnet/Opus (complex transforms)
    v
Return result with metadata about which tier was used
```

**Fallback Decision Matrix:**

| Condition | Action | Latency Impact |
|-----------|--------|---------------|
| WASM module available, cached | Use WASM | <5ms |
| WASM module available, not cached | Compile + use WASM | <50ms |
| WASM module not available, native exists | Use native module | <20ms |
| No WASM or native, CLI available | Shell out to CLI | 100-500ms |
| Nothing local available | Route to LLM via ADR-026 | 500-5000ms |

### Integration with Existing Architecture

```
ADR-026 (Model Router)          This ADR (WASM Runtime)
+-------------------------+     +---------------------------+
|                         |     |                           |
|  Task Input             |     |                           |
|    |                    |     |                           |
|    v                    |     |                           |
|  AgentBoosterPreproc.   |---->|  WASM Plugin Runtime      |
|    |                    |     |    |                       |
|    | confidence >= 0.8  |     |    v                       |
|    | (Tier 1)          |     |  LanguageProvider.parse()  |
|    |                    |     |  LanguageProvider.transform|
|    v                    |     |  LanguageProvider.print()  |
|  Execute via Booster    |     |    |                       |
|                         |     |    v                       |
|                         |     |  Result                    |
+-------------------------+     +---------------------------+

Integration Points:
  1. ADR-026 detects Tier 1 intent -> invokes this WASM runtime
  2. Task #4 LanguageProvider interface -> implemented as WASM plugin ABI
  3. Task #6 Transform DSL -> serialized as MessagePack instruction
  4. Task #5 tree-sitter -> bundled as WASM module (universal fallback)
```

---

## TypeScript Interface Definitions

### Runtime Core

```typescript
// src/agent-booster/wasm/runtime.ts

import { Plugin, PluginOutput } from '@extism/extism';

/**
 * Configuration for the WASM plugin runtime.
 */
export interface WasmRuntimeConfig {
    /** Directory for compiled module cache */
    cacheDir: string;

    /** Maximum number of concurrent worker threads */
    maxWorkers: number;

    /** Modules to pre-compile at startup */
    preWarmModules: string[];

    /** Per-plugin execution timeout in milliseconds */
    pluginTimeoutMs: number;

    /** Per-plugin maximum memory in MB */
    pluginMaxMemoryMB: number;

    /** Per-plugin instruction fuel limit */
    pluginFuelLimit: number;

    /** CDN/registry URL for downloading modules */
    registryUrl: string;

    /** Whether to verify module integrity via SHA-256 */
    verifyIntegrity: boolean;
}

/**
 * Represents a loaded and ready WASM language provider plugin.
 */
export interface LoadedPlugin {
    /** Unique identifier (e.g., "typescript@1.0.0") */
    id: string;

    /** Languages this plugin handles */
    languages: string[];

    /** Extism plugin instance */
    instance: Plugin;

    /** When this plugin was last used (for LRU eviction) */
    lastUsedAt: number;

    /** Compiled WebAssembly.Module (for transfer to workers) */
    compiledModule: WebAssembly.Module;
}

/**
 * Result of a plugin function call.
 */
export interface PluginCallResult<T> {
    /** Whether the call succeeded */
    success: boolean;

    /** The result data (if success) */
    data?: T;

    /** Error message (if failure) */
    error?: string;

    /** Execution duration in microseconds */
    durationUs: number;

    /** Which tier/fallback was used */
    tier: 'wasm' | 'native' | 'cli' | 'llm';
}

/**
 * The main WASM runtime that manages plugin lifecycle.
 */
export interface WasmRuntime {
    /** Initialize the runtime, pre-warm modules */
    initialize(config: WasmRuntimeConfig): Promise<void>;

    /** Load a language provider plugin from WASM */
    loadPlugin(moduleSource: WasmModuleSource): Promise<LoadedPlugin>;

    /** Get a loaded plugin for a given language */
    getPluginForLanguage(language: string): LoadedPlugin | undefined;

    /** Execute a parse operation */
    parse(language: string, source: string, filename: string): Promise<PluginCallResult<ParseResult>>;

    /** Execute a transform operation */
    transform(language: string, ast: Uint8Array, instruction: Uint8Array): Promise<PluginCallResult<TransformResult>>;

    /** Execute a print operation */
    print(language: string, ast: Uint8Array): Promise<PluginCallResult<string>>;

    /** Full pipeline: parse -> transform -> print */
    execute(language: string, source: string, filename: string, instruction: Uint8Array): Promise<PluginCallResult<string>>;

    /** Shut down all workers and release resources */
    shutdown(): Promise<void>;

    /** Runtime statistics */
    getStats(): RuntimeStats;
}

/**
 * Source for a WASM module.
 */
export type WasmModuleSource =
    | { type: 'bundled'; name: string }
    | { type: 'file'; path: string }
    | { type: 'url'; url: string; integrity?: string }
    | { type: 'buffer'; data: Uint8Array };

/**
 * Runtime statistics for monitoring.
 */
export interface RuntimeStats {
    loadedPlugins: number;
    cachedModules: number;
    activeWorkers: number;
    totalInvocations: number;
    avgLatencyUs: number;
    p99LatencyUs: number;
    cacheHitRate: number;
    fallbackCount: Record<string, number>;
}
```

### Worker Pool

```typescript
// src/agent-booster/wasm/worker-pool.ts

export interface WorkerPoolConfig {
    minWorkers: number;
    maxWorkers: number;
    idleTimeoutMs: number;
    workerMemoryLimitMB: number;
    preWarm: string[];
}

export interface WorkerTask<T> {
    id: string;
    pluginId: string;
    functionName: string;
    input: Uint8Array;
    resolve: (result: T) => void;
    reject: (error: Error) => void;
    enqueuedAt: number;
}

export interface WorkerInfo {
    id: number;
    state: 'idle' | 'busy' | 'warming' | 'shutting-down';
    loadedPlugins: string[];
    currentTask?: string;
    memoryUsageMB: number;
}

export interface WorkerPool {
    initialize(config: WorkerPoolConfig): Promise<void>;
    dispatch<T>(task: WorkerTask<T>): Promise<void>;
    getWorkerInfo(): WorkerInfo[];
    scale(targetWorkers: number): Promise<void>;
    shutdown(): Promise<void>;
}
```

### Module Cache

```typescript
// src/agent-booster/wasm/module-cache.ts

export interface ModuleCacheConfig {
    /** Directory for disk cache */
    diskCacheDir: string;

    /** Maximum in-memory compiled modules */
    maxMemoryModules: number;

    /** Maximum disk cache size in MB */
    maxDiskCacheMB: number;

    /** TTL for cached modules in milliseconds */
    moduleTTLMs: number;
}

export interface CachedModule {
    id: string;
    version: string;
    compiledModule: WebAssembly.Module;
    integrity: string;
    cachedAt: number;
    lastAccessedAt: number;
    sizeBytes: number;
}

export interface ModuleCache {
    /** Get a compiled module from cache */
    get(id: string, version: string): Promise<CachedModule | undefined>;

    /** Store a compiled module in cache */
    put(id: string, version: string, module: WebAssembly.Module, integrity: string): Promise<void>;

    /** Evict a module from cache */
    evict(id: string): Promise<void>;

    /** Clear all cached modules */
    clear(): Promise<void>;

    /** Get cache statistics */
    stats(): { memoryModules: number; diskModules: number; hitRate: number };
}
```

---

## Performance Analysis

### Latency Breakdown (Single File Transform)

| Phase | First Use | Cached | Notes |
|-------|-----------|--------|-------|
| Language detection | <0.1ms | <0.1ms | File extension lookup |
| Plugin lookup | <0.1ms | <0.1ms | Map.get() |
| Module compilation | 10-40ms | 0ms | V8 Liftoff, cached after first use |
| Plugin instantiation | 5-10ms | 2-3ms | Extism warm instance |
| Source -> WASM memory | <0.5ms | <0.5ms | Copy semantics, typical file <100KB |
| Parse | 1-10ms | 1-10ms | Depends on file size and language |
| Transform | <1ms | <1ms | AST manipulation, small instruction |
| Print | 1-5ms | 1-5ms | AST -> source with formatting |
| Result -> JS | <0.5ms | <0.5ms | Copy from WASM output buffer |
| **Total** | **~20-65ms** | **<5-20ms** | Meets <50ms first use, <5ms cached target |

### Memory Overhead

| Component | Memory | Notes |
|-----------|--------|-------|
| Extism JS SDK | ~5MB | One-time load |
| TypeScript WASM module | ~2MB | Compiled module in V8 |
| tree-sitter WASM module | ~500KB | Universal fallback |
| Per-worker overhead | ~10MB | V8 worker thread baseline |
| Plugin linear memory | 1-256MB | Grows with file size |
| **Total (2 workers)** | **~30MB** | Acceptable for CLI tool |

### Comparison with Current Agent Booster

| Metric | Current (v2) | Redesigned (WASM) | Notes |
|--------|-------------|-------------------|-------|
| Transform latency | <1ms (simulated) | <5ms (real AST) | Real parsing vs. string manipulation |
| Language support | JS/TS only (text) | Go, Rust, TS, extensible | True multi-language |
| Transform correctness | Low (regex/string) | High (AST-based) | Preserves semantics |
| Memory usage | ~5MB | ~30MB | More capability, more memory |
| Extensibility | None | Plugin architecture | Third-party providers |
| Security | Process-level | WASM sandbox | Memory-isolated per plugin |

---

## Implementation Plan

### Phase 1: Core Runtime (Week 1-2)
1. Set up Extism JS SDK integration
2. Implement `ModuleCache` with LRU eviction
3. Implement `WasmRuntime` with single-threaded execution
4. Bundle TypeScript provider as WASM module
5. Integration test: parse -> transform -> print pipeline

### Phase 2: Worker Pool (Week 3)
1. Implement `WorkerPool` with `worker_threads`
2. Module transfer via `postMessage`
3. Batch transform support (parallel files)
4. Worker auto-scaling based on queue depth

### Phase 3: Plugin Ecosystem (Week 4)
1. Implement `ModuleLoader` with CDN/registry download
2. Integrity verification (SHA-256)
3. Plugin manifest format and versioning
4. Bundle Go and Rust providers

### Phase 4: Fallback Chain (Week 5)
1. Native Node.js module fallback
2. CLI tool fallback
3. LLM routing fallback (ADR-026 integration)
4. Fallback selection metrics and telemetry

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Extism SDK instability (pre-1.0) | Plugin failures | Pin version, maintain fork if needed |
| V8 WASM code caching not exposed in Node.js | Slower cold starts | Use `WebAssembly.compile()` + in-memory Map |
| Large WASM modules slow to download | Poor first-use experience | Bundle common modules, lazy-load others |
| MessagePack schema evolution | Breaking changes | Version the schema, support forward/backward compat |
| Worker thread memory leaks | OOM over time | Periodic worker recycling, memory monitoring |
| Plugin escape from sandbox | Security vulnerability | WASM memory isolation + Extism fuel limits + no WASI |

## Alternatives Considered

### 1. wasmtime-js as Runtime
- **Pro**: Full WASI Preview 2 support, Component Model native
- **Con**: Additional native dependency (~15MB), FFI bridge overhead, cold start ~3ms vs 0ms for V8 built-in
- **Decision**: Rejected. V8 built-in is sufficient and zero-overhead in Node.js.

### 2. wasmer-js as Runtime
- **Pro**: Good WASI support, Wasmer ecosystem
- **Con**: Similar FFI overhead to wasmtime-js, less mature JS SDK
- **Decision**: Rejected for same reasons as wasmtime-js.

### 3. Raw WebAssembly API (no Extism)
- **Pro**: Zero additional dependencies, full control
- **Con**: Must implement memory management, host functions, plugin lifecycle from scratch. Weeks of infrastructure work.
- **Decision**: Rejected. Extism provides exactly the plugin framework we need.

### 4. WASI Preview 2 / Component Model via Jco
- **Pro**: Future-proof, standard interfaces
- **Con**: Node.js doesn't support WASIp2 natively yet. Jco transpilation adds ~10-20ms startup per module. Component Model is W3C Phase 2/3.
- **Decision**: Deferred. We define WIT interfaces now but execute via Extism. Will migrate when Node.js gets native WASIp2 (expected 2026-2027).

### 5. SharedArrayBuffer for Zero-Copy Data Passing
- **Pro**: Eliminates copy overhead between host and guest
- **Con**: Extism doesn't support shared memory. Requires COOP/COEP headers in browsers. For typical file sizes (<100KB), copy overhead is <0.1ms.
- **Decision**: Rejected. Copy semantics are fast enough and simpler.

## References

- [Extism JS SDK](https://github.com/extism/js-sdk) - Plugin framework for Node.js
- [Jco 1.0](https://bytecodealliance.org/articles/jco-1.0) - JavaScript toolchain for WebAssembly Components
- [WASI 0.2 Launch](https://bytecodealliance.org/articles/WASI-0.2) - WASI Preview 2 specification
- [V8 WASM Code Caching](https://v8.dev/blog/wasm-code-caching) - V8 compilation pipeline
- [V8 WASM Compilation Pipeline](https://v8.dev/docs/wasm-compilation-pipeline) - Liftoff and TurboFan
- [WASM Runtime Benchmarks 2026](https://wasmruntime.com/en/benchmarks) - Runtime performance comparison
- [WebAssembly Memory (MDN)](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory) - Linear memory reference
- [Node.js WASI Preview 2 Issue](https://github.com/nodejs/node/issues/55396) - Tracking WASIp2 support
- [Component Model Memory Passing](https://github.com/WebAssembly/component-model/issues/314) - Efficient data exchange
- ADR-026: Agent Booster Model Routing
- ADR-004: Plugin Architecture
