# ADR-066: Agent Booster AST Redesign -- Multi-Language Transform Engine

**Status:** Proposed
**Date:** 2026-03-20
**Author:** System Architecture Designer (Synthesis Agent)
**Supersedes:** ADR-026 (Agent Booster Model Routing) -- extends Tier 1 from regex to AST
**Related:** ADR-017 (RuVector Integration), ADR-056 (Agentic-Flow v3)

---

## 1. Executive Summary

This ADR proposes replacing Agent Booster's regex-based code transformation engine with a
full AST-based architecture supporting Go, Rust, and TypeScript as first-class languages,
with tree-sitter as a universal fallback/discovery layer. The system runs language-specific
AST engines as WASM plugins within a sandboxed runtime, accepts transforms via a structured
DSL, and preserves formatting through concrete syntax tree (CST) techniques.

The redesign preserves the existing 3-tier routing model (ADR-026) while dramatically
expanding Tier 1 capabilities from 6 regex-matched intents to arbitrary AST-aware transforms.

---

## 2. Architecture Overview

```
                         +---------------------------+
                         |   Instruction Parser      |
                         |  (NL / DSL -> Transform)  |
                         +------------+--------------+
                                      |
                                      v
+----------------+       +---------------------------+       +------------------+
| 3-Tier Router  | ----> |   Transform Engine        | ----> | Format-Preserving|
| (ADR-026)      |       |  (DSL -> AST Operations)  |       | Printer          |
| Tier 1 Gate    |       +--+------+------+----------+       +------------------+
+----------------+          |      |      |                          |
                            v      v      v                          v
                   +------+ +------+ +--------+              +----------------+
                   | Go   | | Rust | | TS/JS  |              | Output Source  |
                   | Prov.| | Prov.| | Prov.  |              | (formatted)    |
                   +--+---+ +--+---+ +---+----+              +----------------+
                      |        |         |
               +------+--------+---------+-------+
               |   WASM Plugin Host (Extism)     |
               |   - Sandboxed execution         |
               |   - Shared memory protocol      |
               |   - Module caching              |
               +------+--------+---------+-------+
                      |        |         |
               +------+--------+---------+-------+
               |   Language Provider Registry    |
               |   - Capability discovery        |
               |   - Version negotiation         |
               |   - Hot-reload support          |
               +------+--------+---------+-------+
                      |
                      v
               +-----------------------------+
               | tree-sitter (Universal)     |
               | - Query/discovery layer     |
               | - Fallback for unsupported  |
               |   languages (100+)          |
               | - Incremental re-parsing    |
               +-----------------------------+
                      |
                      v
               +-----------------------------+
               | Error Handler               |
               | - Parse error recovery      |
               | - Partial transform rollback|
               | - LLM fallback cascade      |
               |   (Tier 1 -> Tier 2 -> T3)  |
               +-----------------------------+
```

### Component Interaction Flow

```
1. Input: (source_code, transform_instruction, language)
2. Router: EnhancedModelRouter.route() determines if Tier 1 can handle it
3. Parse Instruction: InstructionParser converts NL/DSL to TransformInstruction[]
4. Resolve Provider: LanguageProviderRegistry.getProvider(language)
5. Parse Source: provider.parse(source) -> CST/AST
6. Execute Transforms: engine.apply(ast, instructions[]) -> modified AST
7. Print: provider.print(ast) -> formatted source (preserving original style)
8. Validate: diff-based sanity check, optional type-check for TS
9. Output: { transformedSource, diff, metadata }

On any failure at steps 4-8: fall back to Tier 2 (Sonnet) or Tier 3 (Opus)
```

---

## 3. Technology Decisions

### 3.1 Go

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Parser | `go/parser` + `go/ast` + `go/token` | Standard library, authoritative, zero dependencies |
| Printer | `go/printer` (with `go/format`) | Produces gofmt-canonical output; idiomatic Go is always gofmt'd |
| CST/Comments | `go/ast.CommentMap` | Maps comments to AST nodes; `go/printer` preserves them |
| WASM Strategy | Compile Go parser to WASM via `GOOS=js GOARCH=wasm` | Go's native WASM target; ~2-5MB binary, <100ms cold start |
| Import Mgmt | `golang.org/x/tools/imports` (goimports) | Auto-manages import additions/removals after transforms |

**Key insight:** Go's `go/printer` always normalizes formatting to gofmt style, which is
the community standard. This means formatting preservation is a non-issue for Go -- output
is always canonical. Comment preservation works via `ast.CommentMap` which associates
comments with nearby nodes.

### 3.2 Rust

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Parser | `syn` (with `full` feature) for transforms; `rowan`/`ra_syntax` for CST | `syn` is the de facto Rust parser; `rowan` preserves all trivia |
| Printer | `prettyplease` for AST->source; `rowan` for lossless round-trips | `prettyplease` produces rustfmt-like output; rowan preserves original |
| CST/Comments | `rowan` (rust-analyzer's syntax library) | Lossless CST that preserves whitespace, comments, and trivia |
| WASM Strategy | Compile via `wasm32-wasi` target, `wasm-pack` | Native Rust->WASM; syn + rowan work in WASM; ~1-3MB binary |
| Macro Handling | `proc-macro2` for token manipulation | Handles derive macros, attribute macros at token level |

**Key insight:** Rust has a unique split between `syn` (lossy AST, great for transforms)
and `rowan` (lossless CST, great for formatting). The architecture uses a dual approach:
`syn` for structural transforms (rename, wrap, add impl), `rowan` for trivia-preserving
edits (add comment, reorder use statements). For transforms that need both, parse with
`rowan`, convert to `syn` for the transform, then splice the result back into the `rowan`
tree to preserve surrounding trivia.

### 3.3 TypeScript/JavaScript

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Parser | **Oxc** (primary), SWC (fallback), TS Compiler API (type-aware) | Oxc: fastest, Rust-based, WASM-ready; SWC: mature, proven |
| Printer | Oxc codegen (primary), `recast` for format-preserving reprints | Oxc is 3-5x faster than SWC; recast preserves original style |
| CST/Comments | Oxc preserves comments in AST; `recast` for full CST fidelity | Trade-off: Oxc is faster, recast is more format-faithful |
| WASM Strategy | Oxc and SWC both ship WASM builds (`@oxc-parser/wasm`, `@swc/wasm-web`) | Pre-built WASM packages, no compilation needed |
| Type-Aware | TypeScript Compiler API via `ts-morph` (on-demand, Tier 1.5) | Only loaded for type-aware transforms; adds ~200ms |
| JSX/TSX | Oxc handles JSX natively; SWC likewise | Both parsers support full JSX/TSX syntax |

**Key insight:** TypeScript has the richest ecosystem. The tiered approach is:
- **Fast path** (Tier 1a): Oxc for syntax-only transforms (<5ms). Handles var->const,
  remove-console, add-logging, rename, wrap-in-try-catch.
- **Type-aware path** (Tier 1b): ts-morph + TypeScript Compiler API for transforms that
  need type information (~200ms). Handles add-types, extract-interface, make-generic.
- Type-aware transforms still avoid LLM calls, staying in Tier 1 budget at 200ms
  (vs. 500ms+ for Tier 2 Haiku).

### 3.4 tree-sitter (Universal Layer)

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Role | Query/discovery layer + fallback parser for unsupported languages | Supports 100+ languages; incremental; WASM-ready |
| Binding | `web-tree-sitter` (WASM) | Browser and Node.js compatible; ~500KB + grammar |
| Query Language | S-expression queries for pattern matching | Powerful structural search without full AST transform |
| When Used | (a) Language not in provider registry (b) Structural search across files (c) Incremental re-parse after transform for validation |
| Not Used For | Primary transforms in Go/Rust/TS | Native parsers are more accurate and feature-rich |

**Key insight:** tree-sitter's role is strategic, not primary. It serves as:
1. **Discovery**: Find code patterns across any language (like a structural grep)
2. **Fallback**: Parse languages that don't have a dedicated provider (Python, Java, etc.)
3. **Validation**: Incrementally re-parse transformed output to verify syntax correctness
4. **Future-proofing**: New languages get tree-sitter support immediately; dedicated
   providers can be added later for higher-quality transforms

---

## 4. Interface Definitions

### 4.1 LanguageProvider

```typescript
/**
 * Core abstraction for language-specific AST operations.
 * Each supported language implements this interface, either natively
 * or as a WASM plugin.
 */
export interface LanguageProvider {
  /** Unique language identifier (e.g., 'go', 'rust', 'typescript') */
  readonly languageId: string;

  /** Semantic version of this provider */
  readonly version: string;

  /** File extensions this provider handles (e.g., ['.go'], ['.ts', '.tsx']) */
  readonly fileExtensions: string[];

  /** Supported transform capabilities */
  getCapabilities(): TransformCapability[];

  /**
   * Parse source code into an AST/CST representation.
   * Returns an opaque handle that the provider can operate on.
   * The handle includes trivia (comments, whitespace) for preservation.
   */
  parse(source: string, options?: ParseOptions): Promise<ParseResult>;

  /**
   * Apply a single transform operation to the parsed tree.
   * Returns a new tree (immutable transformation).
   */
  transform(
    tree: ParseResult,
    instruction: TransformInstruction
  ): Promise<TransformResult>;

  /**
   * Print the AST/CST back to source code.
   * Must preserve comments and formatting where possible.
   */
  print(tree: ParseResult, options?: PrintOptions): Promise<string>;

  /**
   * Validate that the transformed source is syntactically correct.
   * Optionally performs type-checking (for TypeScript).
   */
  validate(source: string, level?: 'syntax' | 'types'): Promise<ValidationResult>;

  /**
   * Release resources associated with a parsed tree.
   */
  dispose(tree: ParseResult): void;
}

export interface ParseOptions {
  /** Preserve trivia (comments, whitespace). Default: true */
  preserveTrivia?: boolean;
  /** Enable type resolution (TypeScript only). Default: false */
  resolveTypes?: boolean;
  /** Source file path for error messages */
  filePath?: string;
}

export interface ParseResult {
  /** Opaque handle to the parsed tree (implementation-specific) */
  handle: unknown;
  /** Language detected/confirmed */
  language: string;
  /** Parse errors (may be non-empty for error-tolerant parsing) */
  errors: ParseError[];
  /** Whether the parse was complete or partial */
  isComplete: boolean;
  /** Metadata about the parse (node count, depth, etc.) */
  metadata: {
    nodeCount: number;
    maxDepth: number;
    hasTypeInfo: boolean;
    parseTimeMs: number;
  };
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
  severity: 'error' | 'warning';
}

export interface PrintOptions {
  /** Target formatting style */
  style?: 'preserve' | 'canonical' | 'minified';
  /** Indentation (spaces or tab) */
  indent?: string;
  /** Line width for wrapping */
  lineWidth?: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ParseError[];
  warnings: ParseError[];
}

export interface TransformCapability {
  /** Transform type identifier */
  type: string;
  /** Human-readable description */
  description: string;
  /** Whether this transform needs type information */
  requiresTypes: boolean;
  /** Estimated complexity (affects Tier 1 eligibility) */
  complexity: 'trivial' | 'simple' | 'moderate';
  /** Example instructions that trigger this capability */
  examples: string[];
}
```

### 4.2 TransformInstruction / TransformResult

```typescript
/**
 * A structured representation of a code transformation.
 * Generated by the InstructionParser from NL or DSL input.
 */
export interface TransformInstruction {
  /** Transform operation type */
  type: TransformOperationType;

  /** Target selector -- identifies what to transform */
  target: TransformTarget;

  /** Operation-specific parameters */
  params: Record<string, unknown>;

  /** Optional condition for conditional transforms */
  condition?: TransformCondition;

  /** Execution priority (lower = first). Default: 0 */
  priority?: number;
}

export type TransformOperationType =
  // Structural
  | 'rename'           // Rename symbol (function, variable, class, field)
  | 'add-parameter'    // Add parameter to function signature
  | 'remove-parameter' // Remove parameter from function signature
  | 'extract-function' // Extract code block into new function
  | 'inline-function'  // Inline function call with its body
  | 'extract-variable' // Extract expression into variable
  // Wrapping / Unwrapping
  | 'wrap'             // Wrap code in construct (try-catch, if, async, etc.)
  | 'unwrap'           // Remove wrapping construct
  // Conversion
  | 'convert'          // Convert between patterns (var->const, callback->async)
  | 'replace-pattern'  // Replace structural pattern with another
  // Addition / Removal
  | 'add-import'       // Add import/use/require statement
  | 'remove-import'    // Remove unused import
  | 'add-field'        // Add field to struct/class/interface
  | 'remove-field'     // Remove field
  | 'add-method'       // Add method to class/impl
  | 'add-annotation'   // Add decorator/attribute/annotation
  // TypeScript-specific
  | 'add-type'         // Add type annotation
  | 'extract-interface'// Extract interface from class
  | 'make-generic'     // Add generic type parameters
  // Bulk
  | 'remove-by-pattern'// Remove all nodes matching pattern (e.g., console.*)
  | 'add-by-pattern'   // Add nodes at pattern match sites
  // Custom
  | 'custom'           // Provider-specific transform via custom handler

/**
 * Identifies the target of a transform operation.
 */
export interface TransformTarget {
  /** Target by symbol name */
  name?: string;
  /** Target by node type (e.g., 'function', 'class', 'variable') */
  nodeType?: string;
  /** Target by line range */
  lineRange?: { start: number; end: number };
  /** Target by structural query (tree-sitter S-expression) */
  query?: string;
  /** Target by regex pattern on source text */
  pattern?: RegExp | string;
  /** Target scope ('file' | 'function' | 'class' | 'block') */
  scope?: string;
}

/**
 * Condition for conditional transforms.
 */
export interface TransformCondition {
  /** Only apply if target has specific properties */
  hasProperty?: Record<string, unknown>;
  /** Only apply if target does NOT have properties */
  notHasProperty?: Record<string, unknown>;
  /** Only apply if node count matches */
  nodeCount?: { min?: number; max?: number };
  /** Custom predicate (serializable expression) */
  predicate?: string;
}

/**
 * Result of applying a transform.
 */
export interface TransformResult {
  /** Whether the transform was applied successfully */
  success: boolean;
  /** The modified parse tree (or original if unchanged) */
  tree: ParseResult;
  /** Number of AST nodes modified */
  nodesModified: number;
  /** Diff of changes (unified format) */
  diff?: string;
  /** Warnings generated during transform */
  warnings: string[];
  /** If failed, the error description */
  error?: string;
  /** Transform execution time */
  transformTimeMs: number;
  /** Whether a rollback is available */
  canRollback: boolean;
}
```

### 4.3 WASMPluginABI

```typescript
/**
 * ABI contract for WASM-based language provider plugins.
 * Uses Extism-compatible calling conventions.
 *
 * Each WASM plugin exports these functions. Parameters and returns
 * are JSON-encoded strings passed through WASM linear memory.
 */
export interface WASMPluginABI {
  // --- Lifecycle ---

  /** Initialize the plugin. Returns provider metadata. */
  'plugin_init': () => ProviderMetadata;

  /** Shut down and release all resources. */
  'plugin_shutdown': () => void;

  // --- Core Operations ---

  /**
   * Parse source code.
   * Input: { source: string, options?: ParseOptions }
   * Output: { handle: number, errors: ParseError[], metadata: {...} }
   *
   * The handle is an index into the plugin's internal tree store.
   */
  'parse': (input: string) => string;

  /**
   * Apply a transform to a parsed tree.
   * Input: { handle: number, instruction: TransformInstruction }
   * Output: { success: boolean, handle: number, nodesModified: number, ... }
   */
  'transform': (input: string) => string;

  /**
   * Print a parsed tree back to source.
   * Input: { handle: number, options?: PrintOptions }
   * Output: { source: string }
   */
  'print': (input: string) => string;

  /**
   * Validate source code syntax.
   * Input: { source: string, level: 'syntax' | 'types' }
   * Output: { isValid: boolean, errors: ParseError[] }
   */
  'validate': (input: string) => string;

  /**
   * Release a parsed tree handle.
   * Input: { handle: number }
   */
  'dispose': (input: string) => void;

  /**
   * List supported transform capabilities.
   * Output: TransformCapability[]
   */
  'get_capabilities': () => string;
}

/**
 * Metadata returned by plugin_init.
 */
export interface ProviderMetadata {
  languageId: string;
  version: string;
  fileExtensions: string[];
  /** Maximum source size this plugin can handle (bytes) */
  maxSourceSize: number;
  /** WASM memory usage estimate (bytes) */
  memoryEstimate: number;
  /** Features supported beyond basic parse/transform/print */
  features: ('type-resolution' | 'incremental-parse' | 'error-tolerant' | 'cst-fidelity')[];
}
```

### 4.4 BenchmarkHarness

```typescript
/**
 * Benchmark harness for measuring AST transform performance.
 * Used to validate Tier 1 latency budgets and compare approaches.
 */
export interface BenchmarkHarness {
  /**
   * Register a corpus of test files for a language.
   */
  registerCorpus(language: string, files: BenchmarkFile[]): void;

  /**
   * Run a specific benchmark.
   */
  run(config: BenchmarkConfig): Promise<BenchmarkReport>;

  /**
   * Run the full benchmark suite (all languages, all transforms).
   */
  runSuite(): Promise<BenchmarkSuiteReport>;

  /**
   * Compare two approaches (e.g., regex vs. AST, Oxc vs. SWC).
   */
  compare(
    a: BenchmarkConfig,
    b: BenchmarkConfig
  ): Promise<BenchmarkComparison>;
}

export interface BenchmarkFile {
  /** File path (for identification) */
  path: string;
  /** Source content */
  content: string;
  /** Approximate complexity category */
  complexity: 'small' | 'medium' | 'large' | 'xlarge';
  /** Lines of code */
  loc: number;
}

export interface BenchmarkConfig {
  /** Language to benchmark */
  language: string;
  /** Provider implementation to use */
  provider: string;
  /** Transform to benchmark (or 'parse-only', 'print-only', 'round-trip') */
  transform: string | TransformInstruction;
  /** Number of iterations */
  iterations: number;
  /** Warmup iterations (excluded from results) */
  warmup: number;
  /** File size filter */
  complexity?: 'small' | 'medium' | 'large' | 'xlarge';
}

export interface BenchmarkReport {
  config: BenchmarkConfig;
  results: {
    parseTimeMs: { p50: number; p95: number; p99: number; mean: number };
    transformTimeMs: { p50: number; p95: number; p99: number; mean: number };
    printTimeMs: { p50: number; p95: number; p99: number; mean: number };
    totalTimeMs: { p50: number; p95: number; p99: number; mean: number };
    memoryPeakBytes: number;
    throughputOpsPerSec: number;
  };
  /** Whether the Tier 1 latency budget (<10ms) was met */
  meetsTier1Budget: boolean;
  /** Timestamp */
  timestamp: string;
}

export interface BenchmarkSuiteReport {
  reports: BenchmarkReport[];
  summary: {
    languageResults: Record<string, {
      meetsTier1: boolean;
      avgTotalMs: number;
      slowestTransform: string;
    }>;
    overallMeetsTier1: boolean;
  };
  timestamp: string;
}

export interface BenchmarkComparison {
  a: BenchmarkReport;
  b: BenchmarkReport;
  speedup: {
    parse: number;
    transform: number;
    print: number;
    total: number;
  };
  winner: string;
}

// --- Corpus Definitions ---

/**
 * Standard benchmark corpus sizes.
 */
export const BENCHMARK_CORPUS_SIZES = {
  small: { minLoc: 10, maxLoc: 100 },
  medium: { minLoc: 100, maxLoc: 500 },
  large: { minLoc: 500, maxLoc: 2000 },
  xlarge: { minLoc: 2000, maxLoc: 10000 },
} as const;

/**
 * Tier 1 latency budgets.
 */
export const TIER1_BUDGETS = {
  parseMs: 5,
  transformMs: 3,
  printMs: 2,
  totalMs: 10,
  /** Type-aware transforms get a higher budget */
  typeAwareTotalMs: 200,
} as const;
```

---

## 5. Transform DSL Design

### 5.1 Instruction Syntax

Transforms can be expressed at three levels of abstraction:

**Level 1: Natural Language** (parsed by InstructionParser)
```
"Convert all var declarations to const in auth.ts"
"Add error handling to the processPayment function"
"Rename UserService to UserRepository"
```

**Level 2: Structured DSL** (JSON-based, machine-friendly)
```json
{
  "type": "convert",
  "target": { "nodeType": "variable", "pattern": "var" },
  "params": { "from": "var", "to": "const" }
}
```

**Level 3: Composable Pipelines** (sequence of transforms)
```json
[
  { "type": "rename", "target": { "name": "UserService" }, "params": { "newName": "UserRepository" } },
  { "type": "add-import", "params": { "module": "./repository", "named": ["BaseRepository"] } },
  { "type": "wrap", "target": { "name": "processPayment" }, "params": { "wrapper": "try-catch", "errorVar": "err" } }
]
```

### 5.2 NL-to-DSL Mapping

The InstructionParser maps natural language patterns to structured transforms:

| NL Pattern | DSL Type | DSL Params |
|------------|----------|------------|
| "convert var to const" | `convert` | `{from: "var", to: "const"}` |
| "rename X to Y" | `rename` | `{newName: "Y"}` |
| "wrap X in try-catch" | `wrap` | `{wrapper: "try-catch"}` |
| "add error handling to X" | `wrap` | `{wrapper: "try-catch"}` |
| "remove console.log" | `remove-by-pattern` | `{pattern: "console.*"}` |
| "add logging to X" | `add-by-pattern` | `{pattern: "function-entry", template: "console.log"}` |
| "make X async" | `convert` | `{from: "sync", to: "async"}` |
| "extract function from lines N-M" | `extract-function` | `{lineRange: {start, end}}` |
| "add type to X" | `add-type` | `{infer: true}` |

---

## 6. Formatting Preservation Strategy

### 6.1 Per-Language Approach

| Language | Strategy | Tool | Fidelity |
|----------|----------|------|----------|
| **Go** | Canonical normalization | `go/printer` (gofmt) | Perfect (gofmt is standard) |
| **Rust** | Dual CST/AST | `rowan` for trivia, `prettyplease` for structure | High (preserves comments, normalizes style) |
| **TypeScript** | Format-preserving reprint | `recast` (preserves), Oxc codegen (fast) | High with recast, Good with Oxc |

### 6.2 General Principles

1. **Parse to CST, not AST** -- Preserve trivia (comments, whitespace) in the tree
2. **Minimal node replacement** -- Only replace the specific nodes that change; leave surrounding trivia intact
3. **Post-transform formatting** -- Apply language-specific formatter only to changed regions
4. **Diff-based validation** -- After transform, diff against original; reject if too many unrelated changes

### 6.3 Comment Preservation Protocol

```
1. Before transform: Extract comment map (comment -> nearest AST node)
2. During transform: Track which nodes are modified/removed/added
3. After transform: Re-attach orphaned comments to nearest surviving node
4. If comment's anchor node was removed: Attach to parent or next sibling
5. If entire block removed: Preserve comments as standalone (language-specific)
```

---

## 7. WASM Runtime Architecture

### 7.1 Plugin Host Design

```
+----------------------------------------------------------+
|                   WASM Plugin Host                        |
|                                                          |
|  +-------------------+  +-------------------+            |
|  | Module Cache      |  | Memory Allocator  |            |
|  | (compiled WASM)   |  | (per-plugin limit)|            |
|  +-------------------+  +-------------------+            |
|                                                          |
|  +---------------------------------------------------+  |
|  | Plugin Sandbox (per language)                      |  |
|  | - WASI subset (no filesystem, no network)          |  |
|  | - JSON-over-linear-memory communication            |  |
|  | - CPU time limit (100ms hard kill)                 |  |
|  | - Memory limit (64MB per plugin)                   |  |
|  +---------------------------------------------------+  |
|                                                          |
|  +---------------------------------------------------+  |
|  | Extism Runtime                                     |  |
|  | - Plugin lifecycle management                      |  |
|  | - Host function injection                          |  |
|  | - Error isolation (plugin crash != host crash)     |  |
|  +---------------------------------------------------+  |
+----------------------------------------------------------+
```

### 7.2 Module Loading Strategy

| Phase | Action | Latency Target |
|-------|--------|---------------|
| Cold start | Load WASM binary from cache/disk | <50ms |
| Compilation | Compile WASM to native (cached) | <100ms (first time only) |
| Warm start | Instantiate from compiled cache | <5ms |
| Plugin init | Call `plugin_init()` | <10ms |
| Steady state | Parse/transform/print calls | <10ms per operation |

**Caching strategy:**
- Pre-compiled WASM modules cached in `~/.cache/ruflo/wasm/`
- Module compilation happens once per version; subsequent loads are instant
- Lazy loading: Only load language provider when first needed
- Keep hot providers in memory; evict LRU when memory pressure

### 7.3 WASM Binary Sizes (Estimated)

| Plugin | Estimated Size | Notes |
|--------|---------------|-------|
| Go provider | 2-5 MB | Go stdlib parser compiled to WASM |
| Rust provider (syn) | 1-3 MB | syn + prettyplease |
| Rust provider (rowan) | 1-2 MB | rowan + ra_syntax subset |
| TypeScript (Oxc) | 2-4 MB | Already ships WASM |
| TypeScript (SWC) | 3-6 MB | Already ships WASM |
| tree-sitter core | 500 KB | Plus ~200KB per grammar |

---

## 8. Error Handling and Fallback Cascade

### 8.1 Error Taxonomy

| Error Class | Examples | Recovery Strategy |
|-------------|----------|-------------------|
| **Parse Error** | Syntax error in source | Error-tolerant parse (tree-sitter), partial AST, or reject |
| **Transform Error** | Target not found, incompatible transform | Skip transform, return warning |
| **Print Error** | AST too complex for printer | Fall back to basic printer, accept formatting loss |
| **Type Error** | TS type check fails post-transform | Warning only (optional validation) |
| **Runtime Error** | WASM plugin crash, timeout, OOM | Kill plugin, fall back to next tier |
| **Validation Error** | Transformed output is invalid syntax | Rollback transform, fall back |

### 8.2 Fallback Cascade

```
Tier 1a (AST, fast path, <10ms)
  |
  | failure
  v
Tier 1b (AST, type-aware, <200ms)  -- only for TS type-aware transforms
  |
  | failure
  v
Tier 1c (tree-sitter fallback)     -- for unsupported languages
  |
  | failure
  v
Tier 2 (Haiku LLM, ~500ms)        -- existing ADR-026 path
  |
  | failure
  v
Tier 3 (Sonnet/Opus LLM, 2-5s)    -- existing ADR-026 path
```

### 8.3 Transaction Semantics

Each transform operation is wrapped in a transaction:
1. **Snapshot**: Save original parse tree before transform
2. **Apply**: Execute transform on tree
3. **Validate**: Check result syntax (fast re-parse)
4. **Commit or Rollback**: On validation failure, restore snapshot

For multi-step pipelines, the system supports:
- **All-or-nothing**: Rollback entire pipeline on any failure
- **Best-effort**: Apply successful transforms, skip failed ones, report partial results

---

## 9. Migration Plan

### Phase 0: Foundation (Week 1-2)

**Deliverables:**
- LanguageProvider interface (TypeScript types)
- LanguageProviderRegistry with capability discovery
- InstructionParser skeleton (NL-to-DSL for existing 6 intents)
- BenchmarkHarness skeleton
- ADR-066 finalized and accepted

**Backward compatibility:** Zero changes to existing code. New code lives in
`v3/@claude-flow/cli/src/ast-engine/`.

### Phase 1: TypeScript Provider (Week 3-5)

**Deliverables:**
- OxcLanguageProvider (parse, transform, print via `@oxc-parser/wasm`)
- RecastPrinter for format-preserving output
- Migrate existing 6 regex intents to AST-based transforms:
  - `var-to-const`: Oxc AST find VariableDeclaration(var) -> replace with const
  - `add-types`: ts-morph type inference -> add annotations
  - `add-error-handling`: Oxc wrap function body in try-catch
  - `async-await`: Oxc convert .then() chains to await
  - `add-logging`: Oxc insert console.log at function entry
  - `remove-console`: Oxc remove all CallExpression(console.*)
- Benchmark suite for TypeScript
- Integration with EnhancedModelRouter (replace regex detection)

**Backward compatibility:** EnhancedModelRouter.detectIntent() switches from regex
to AST-based detection. Same external interface, better accuracy. Regex patterns
retained as fast pre-filter.

### Phase 2: Go + Rust Providers (Week 6-9)

**Deliverables:**
- GoLanguageProvider (WASM-compiled go/parser + go/printer)
- RustLanguageProvider (WASM-compiled syn + prettyplease)
- WASM Plugin Host (Extism-based)
- Transform DSL expanded: rename, wrap, extract-function, add-import
- Cross-language benchmark comparison

**Backward compatibility:** New languages are additive. No existing behavior changes.

### Phase 3: tree-sitter Integration + DSL Expansion (Week 10-12)

**Deliverables:**
- TreeSitterProvider as universal fallback
- Full NL-to-DSL InstructionParser (beyond the initial 6 intents)
- Composable transform pipelines
- Error-tolerant parsing for all languages
- Plugin hot-reload support

### Phase 4: Production Hardening (Week 13-16)

**Deliverables:**
- Security audit of WASM sandbox
- Performance optimization (module caching, warm pools)
- Comprehensive test suite (unit, integration, benchmark, fuzz)
- Documentation and developer guide for writing new providers
- Monitoring and metrics integration

---

## 10. Risk Assessment

### Risk 1: WASM Binary Size and Cold Start Latency

**Severity:** High
**Probability:** Medium

Go compiled to WASM can be 5-15MB. Cold start for loading + compiling WASM can exceed
100ms, breaking the <10ms Tier 1 budget on first invocation.

**Mitigation:**
- Pre-compile and cache WASM modules (amortize cold start)
- Lazy-load language providers (only load when needed)
- Use `wasm-opt` to minimize binary size
- Keep a warm pool of frequently-used providers
- Accept that first invocation may be 50-100ms; subsequent calls <10ms

### Risk 2: Formatting Preservation Fidelity

**Severity:** High
**Probability:** Medium

Users will reject transforms that scramble their code formatting. Different
languages have different formatting cultures (Go: gofmt is law; Rust: rustfmt is
common but not universal; JS/TS: varied formatters).

**Mitigation:**
- Use CST (not AST) where possible for lossless round-trips
- Offer `style: 'preserve'` vs `style: 'canonical'` print modes
- Diff-based validation: reject transforms with too many unrelated changes
- Per-language formatter integration (gofmt, rustfmt, prettier)
- Show diff to user before applying (dry-run mode)

### Risk 3: Transform Correctness for Complex Cases

**Severity:** High
**Probability:** Medium

AST transforms can produce syntactically valid but semantically wrong code
(e.g., renaming a variable that shadows another, removing error handling
that was actually needed).

**Mitigation:**
- Scope analysis for rename transforms (track all references)
- Type-checking after transform (TypeScript)
- Conservative: only apply transforms with high confidence
- Fallback cascade: if validation fails, escalate to LLM
- Auditable output: always produce a diff for review

### Risk 4: Ecosystem Churn in Rust/WASM Tooling

**Severity:** Medium
**Probability:** Medium

The Rust-to-WASM and JS parser ecosystems are evolving rapidly. Oxc is
relatively new. Extism's API may change.

**Mitigation:**
- Provider abstraction insulates core engine from parser changes
- Support multiple providers per language (Oxc primary, SWC fallback)
- Pin dependency versions; test on CI
- Design for provider hot-swap without core changes

### Risk 5: Security -- Malicious Transform Instructions

**Severity:** High
**Probability:** Low

A crafted transform instruction could potentially inject malicious code
(e.g., "rename processPayment to eval(maliciousCode)").

**Mitigation:**
- WASM sandbox prevents plugin access to filesystem/network
- Transform output validation: re-parse output, diff against input
- Instruction sanitization: validate all string params, reject code-like values
- Configurable transform allowlist per deployment
- Integration with @claude-flow/security module for input validation
- Audit log of all transforms applied

---

## 11. Implementation Roadmap

```
Week 1-2:   [Phase 0: Foundation]
            ├── Define interfaces (LanguageProvider, Transform, WASM ABI)
            ├── Create src/ast-engine/ directory structure
            ├── BenchmarkHarness skeleton
            └── InstructionParser for existing 6 intents

Week 3-5:   [Phase 1: TypeScript Provider]
            ├── OxcLanguageProvider (WASM)
            ├── RecastPrinter (format-preserving)
            ├── Migrate 6 regex intents to AST
            ├── ts-morph type-aware tier
            ├── Benchmark: Oxc vs regex vs SWC
            └── Update EnhancedModelRouter integration

Week 6-7:   [Phase 2a: Go Provider]
            ├── GoLanguageProvider (WASM)
            ├── go/printer integration
            └── Go-specific transforms (add error return, etc.)

Week 8-9:   [Phase 2b: Rust Provider]
            ├── RustLanguageProvider (syn + rowan WASM)
            ├── prettyplease printer
            ├── Rust-specific transforms (derive, impl, etc.)
            └── WASM Plugin Host (Extism) generalized

Week 10-11: [Phase 3a: tree-sitter + DSL]
            ├── TreeSitterProvider (universal fallback)
            ├── Full NL-to-DSL InstructionParser
            ├── Composable transform pipelines
            └── Error-tolerant parsing

Week 12:    [Phase 3b: Polish]
            ├── Plugin hot-reload
            ├── Transform undo/redo
            └── Cross-language search via tree-sitter queries

Week 13-14: [Phase 4a: Security + Testing]
            ├── WASM sandbox security audit
            ├── Fuzz testing for parsers
            ├── Integration test suite
            └── @claude-flow/security module integration

Week 15-16: [Phase 4b: Production]
            ├── Performance optimization
            ├── Monitoring + metrics
            ├── Developer documentation
            └── Provider authoring guide
```

---

## 12. Integration with Existing 3-Tier Routing

The new AST engine replaces the internals of Tier 1 while preserving the external
interface defined in ADR-026:

```typescript
// enhanced-model-router.ts -- updated flow

async route(task: string, context?: { filePath?: string }): Promise<EnhancedRouteResult> {
  // Step 1: Parse instruction to structured DSL
  const instruction = this.instructionParser.parse(task);

  // Step 2: Check if any language provider can handle it
  if (instruction && this.config.agentBoosterEnabled) {
    const language = this.detectLanguage(context?.filePath);
    const provider = this.providerRegistry.getProvider(language);

    if (provider) {
      const capabilities = provider.getCapabilities();
      const canHandle = capabilities.some(c => c.type === instruction.type);

      if (canHandle) {
        const complexity = capabilities.find(c => c.type === instruction.type)?.complexity;
        const needsTypes = capabilities.find(c => c.type === instruction.type)?.requiresTypes;

        return {
          tier: 1,
          handler: 'agent-booster',
          confidence: instruction.confidence,
          reasoning: `AST engine can handle "${instruction.type}" for ${language}`,
          agentBoosterIntent: { type: instruction.type, ... },
          canSkipLLM: true,
          estimatedLatencyMs: needsTypes ? 200 : 5,
          estimatedCost: 0,
        };
      }
    }

    // tree-sitter fallback check
    if (this.treeSitterProvider.hasGrammar(language)) {
      // Limited transforms via tree-sitter (pattern-based only)
      ...
    }
  }

  // Step 3: Fall through to Tier 2/3 (unchanged from ADR-026)
  ...
}
```

---

## 13. File Structure

```
v3/@claude-flow/cli/src/
├── ast-engine/
│   ├── index.ts                     # Public API exports
│   ├── types.ts                     # All interfaces from Section 4
│   ├── language-provider-registry.ts # Provider registration + discovery
│   ├── instruction-parser.ts         # NL/DSL -> TransformInstruction
│   ├── transform-engine.ts           # Orchestrates parse->transform->print
│   ├── format-preserver.ts           # Comment/whitespace preservation logic
│   ├── error-handler.ts              # Error taxonomy + fallback cascade
│   ├── wasm-host.ts                  # Extism-based WASM plugin host
│   ├── benchmark-harness.ts          # Performance benchmarking
│   ├── providers/
│   │   ├── typescript-provider.ts    # Oxc + optional ts-morph
│   │   ├── go-provider.ts            # go/parser WASM wrapper
│   │   ├── rust-provider.ts          # syn + rowan WASM wrapper
│   │   └── tree-sitter-provider.ts   # Universal fallback
│   └── __tests__/
│       ├── instruction-parser.test.ts
│       ├── typescript-provider.test.ts
│       ├── transform-engine.test.ts
│       └── benchmark.test.ts
├── ruvector/
│   ├── enhanced-model-router.ts      # UPDATED: Uses ast-engine
│   ├── model-router.ts               # UNCHANGED: Tier 2/3 routing
│   └── ...
```

---

## 14. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Tier 1 transform latency (syntax) | <10ms p95 | BenchmarkHarness |
| Tier 1 transform latency (type-aware) | <200ms p95 | BenchmarkHarness |
| Formatting preservation fidelity | >95% unchanged lines in diff | Diff analysis |
| Transform correctness | >99% syntactically valid output | Validation suite |
| Language coverage (initial) | Go + Rust + TypeScript | Provider count |
| Language coverage (via tree-sitter) | 100+ languages (read-only/basic transforms) | Grammar count |
| WASM cold start | <100ms | Startup benchmark |
| WASM warm start | <5ms | Startup benchmark |
| Intent detection accuracy | >95% (vs. 85% regex baseline) | Test suite |
| Cost savings vs. LLM | 100% for Tier 1 operations | Routing analytics |

---

## 15. References

- ADR-026: Agent Booster Model Routing (current implementation)
- ADR-017: RuVector Integration Architecture
- ADR-056: Agentic-Flow v3 Integration
- Oxc: https://oxc-project.github.io/
- SWC: https://swc.rs/
- tree-sitter: https://tree-sitter.github.io/
- Extism: https://extism.org/
- rowan: https://github.com/rust-analyzer/rowan
- syn: https://docs.rs/syn/
- recast: https://github.com/benjamn/recast
- prettyplease: https://github.com/dtolnay/prettyplease
- ts-morph: https://ts-morph.com/
