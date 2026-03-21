/**
 * Language Provider Interface for AST-Based Agent Booster
 *
 * Defines the extensible plugin contract for multi-language AST parsing,
 * transformation, and code generation. Replaces regex-based intent matching
 * (ADR-026 Tier 1) with real AST-powered transforms.
 *
 * Design rationale:
 * - NativeAST approach (not UnifiedAST): Each language keeps its native AST
 *   format. A common operation layer defines transforms abstractly. This
 *   follows LSP's insight — abstract operations, not representations.
 * - tree-sitter as optional backbone: Providers may use tree-sitter for
 *   parsing and native tools (ts-morph, syn, go/ast) for typed transforms.
 * - Capability-based dispatch: Providers declare what they can do; the
 *   router picks the best provider for a given transform.
 *
 * Precedent analysis:
 *   LSP:       Abstracts operations (rename, find-refs), not ASTs.
 *   tree-sitter: Uniform CST with language grammars. Good for parsing.
 *   Semgrep:   Pattern-based rules, language-aware. Good for search.
 *   CodeQL:    Query-based over extracted DB. Good for analysis.
 *   Comby:     Structural templates. Good for simple transforms.
 *
 * We take LSP's operation-based philosophy + tree-sitter's uniform parsing +
 * native-tool precision for typed transforms.
 *
 * @module @claude-flow/cli/ruvector/language-provider
 * @see ADR-026 for current Agent Booster routing
 */

// ============================================================================
// AST Node Abstraction
// ============================================================================

/**
 * Opaque handle to a language-specific AST.
 *
 * Each provider works with its own native AST format internally.
 * The ASTHandle is an opaque wrapper that carries the native tree plus
 * metadata needed for cross-cutting operations (source mapping, comments).
 *
 * Rationale: A UnifiedAST forces lossy translation between representations.
 * An opaque handle lets providers keep full fidelity while the operation
 * layer works at a higher abstraction level.
 */
export interface ASTHandle {
  /** Provider that created this handle. Used for dispatch validation. */
  readonly providerId: string;

  /** Language identifier (e.g., 'typescript', 'go', 'rust'). */
  readonly language: string;

  /** Original source text. Retained for diffing and fallback printing. */
  readonly sourceText: string;

  /** Source file path, if known. Used for import resolution and diagnostics. */
  readonly filePath?: string;

  /**
   * Native AST root node. Type is provider-specific.
   * For TypeScript: ts.SourceFile. For Go: *ast.File. For Rust: syn::File.
   * Consumer code should not inspect this directly — use provider methods.
   */
  readonly root: unknown;

  /**
   * Source map from AST nodes to original source positions.
   * Enables comment/whitespace preservation and error reporting.
   */
  readonly sourceMap: SourceMap;

  /**
   * Comments and whitespace trivia extracted during parsing.
   * Stored separately so transforms can reattach them during printing.
   */
  readonly trivia: TriviaStore;
}

/**
 * Bidirectional mapping between AST node positions and source positions.
 */
export interface SourceMap {
  /** Map a source offset to the AST node spanning it. */
  nodeAt(offset: number): ASTNodeRef | null;

  /** Get the source range for a given node reference. */
  rangeOf(nodeRef: ASTNodeRef): SourceRange;

  /** All node references in document order. */
  allNodes(): ASTNodeRef[];
}

/**
 * Opaque reference to an AST node. Provider-specific identity.
 */
export interface ASTNodeRef {
  /** Stable identifier for this node within the AST. */
  readonly id: string;

  /** Node kind/type (e.g., 'FunctionDeclaration', 'VariableStatement'). */
  readonly kind: string;

  /** Parent node reference, null for root. */
  readonly parent: ASTNodeRef | null;
}

/**
 * Byte range in source text.
 */
export interface SourceRange {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

/**
 * Storage for comments, whitespace, and other trivia.
 * Preserving these across transforms is critical for developer experience.
 */
export interface TriviaStore {
  /** Get leading trivia (comments, whitespace) for a node. */
  leadingTrivia(nodeRef: ASTNodeRef): TriviaItem[];

  /** Get trailing trivia for a node. */
  trailingTrivia(nodeRef: ASTNodeRef): TriviaItem[];

  /** Attach trivia to a (possibly new) node during transform. */
  attach(nodeRef: ASTNodeRef, position: 'leading' | 'trailing', trivia: TriviaItem[]): void;
}

export interface TriviaItem {
  readonly kind: 'line-comment' | 'block-comment' | 'whitespace' | 'newline' | 'directive';
  readonly text: string;
  readonly range: SourceRange;
}

// ============================================================================
// Parse Options & Results
// ============================================================================

export interface ParseOptions {
  /** Whether to collect type information (slower, but needed for type-aware transforms). */
  includeTypes?: boolean;

  /** Whether to preserve comments and whitespace trivia (default: true). */
  preserveTrivia?: boolean;

  /** Parser error recovery mode: 'strict' aborts on first error, 'lenient' continues. */
  errorRecovery?: 'strict' | 'lenient';

  /** Additional compiler/parser options specific to the language. */
  languageOptions?: Record<string, unknown>;
}

export interface ParseResult {
  readonly ast: ASTHandle;
  readonly errors: ParseDiagnostic[];
  readonly warnings: ParseDiagnostic[];
  /** Time taken to parse, in milliseconds. */
  readonly parseTimeMs: number;
}

export interface ParseDiagnostic {
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly range?: SourceRange;
  readonly code?: string;
}

// ============================================================================
// Transform Instructions
// ============================================================================

/**
 * A single transform instruction.
 *
 * Instructions are declarative: they describe WHAT to change, not HOW.
 * The provider maps instructions to its native AST manipulation APIs.
 *
 * The instruction set is intentionally small and composable.
 * Complex transforms are built by composing atomic instructions.
 */
export interface TransformInstruction {
  /** Unique identifier for this transform type. Must match a registered capability. */
  readonly type: string;

  /**
   * Target selector: identifies which AST nodes to transform.
   * Can be a node ref, a pattern query (tree-sitter S-expression or
   * language-specific selector), or a scope specification.
   */
  readonly target: TransformTarget;

  /** Transform-specific parameters. Schema defined by the capability. */
  readonly params: Record<string, unknown>;

  /** Optional: human-readable description of intent. */
  readonly description?: string;
}

/**
 * How to select the AST node(s) a transform applies to.
 */
export type TransformTarget =
  | { kind: 'node-ref'; ref: ASTNodeRef }
  | { kind: 'query'; pattern: string; language?: string }
  | { kind: 'scope'; scope: 'file' | 'function' | 'block' | 'class' | 'module'; name?: string }
  | { kind: 'range'; range: SourceRange };

/**
 * Result of applying one or more transform instructions.
 */
export interface TransformResult {
  /** The transformed AST. */
  readonly ast: ASTHandle;

  /** Per-instruction outcomes. */
  readonly outcomes: TransformOutcome[];

  /** Whether all instructions succeeded. */
  readonly success: boolean;

  /** Total time for all transforms, in milliseconds. */
  readonly transformTimeMs: number;
}

export interface TransformOutcome {
  /** Index of the instruction in the input array. */
  readonly instructionIndex: number;

  readonly status: 'applied' | 'skipped' | 'failed';

  /** Number of AST nodes modified. */
  readonly nodesModified: number;

  /** Error details if status is 'failed'. */
  readonly error?: string;

  /** Warnings produced during this transform. */
  readonly warnings: string[];
}

// ============================================================================
// Print Options & Results
// ============================================================================

export interface PrintOptions {
  /** Target formatting style. */
  style?: 'preserve' | 'pretty' | 'minified';

  /** Indentation: number of spaces, or 'tab'. */
  indent?: number | 'tab';

  /** Line ending style. */
  lineEnding?: 'lf' | 'crlf' | 'auto';

  /** Maximum line width for pretty printing. */
  maxLineWidth?: number;

  /** Whether to include source map comment/file. */
  emitSourceMap?: boolean;
}

export interface PrintResult {
  /** Generated source code. */
  readonly code: string;

  /** Source map (input positions -> output positions), if requested. */
  readonly sourceMap?: string;

  /** Time taken to print, in milliseconds. */
  readonly printTimeMs: number;
}

// ============================================================================
// Validation
// ============================================================================

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: ParseDiagnostic[];
  readonly warnings: ParseDiagnostic[];

  /**
   * Structural integrity checks.
   * For example: no dangling references, balanced scopes, valid identifiers.
   */
  readonly structuralIssues: StructuralIssue[];
}

export interface StructuralIssue {
  readonly severity: 'error' | 'warning';
  readonly kind: string;
  readonly message: string;
  readonly nodeRef?: ASTNodeRef;
}

// ============================================================================
// Transform Capabilities
// ============================================================================

/**
 * Declares a transform capability that a provider supports.
 *
 * The capability system enables:
 * 1. Discovery: the router finds which provider handles a transform type.
 * 2. Routing tiers: complexity estimates feed into the 3-tier model router.
 * 3. Validation: parameter schemas catch invalid instructions early.
 */
export interface TransformCapability {
  /** Unique capability identifier (e.g., 'var-to-const', 'add-type-annotation'). */
  readonly id: string;

  /** Human-readable description. */
  readonly description: string;

  /**
   * JSON Schema for the `params` field of TransformInstruction.
   * Used for validation before the transform runs.
   */
  readonly paramSchema: Record<string, unknown>;

  /**
   * Estimated complexity for routing tier decisions.
   * 0.0 = trivial (Tier 1 Agent Booster WASM)
   * 0.3 = moderate (Tier 2 Haiku/Sonnet)
   * 0.6+ = complex (Tier 3 Opus, may need LLM reasoning)
   */
  readonly complexityEstimate: number;

  /** Whether this transform requires type information from the parser. */
  readonly requiresTypeInfo: boolean;

  /** Whether the transform preserves formatting (comments, whitespace). */
  readonly preservesFormatting: boolean;

  /**
   * Categories for grouping in UIs and documentation.
   * Examples: 'modernization', 'type-safety', 'error-handling', 'cleanup'.
   */
  readonly categories: string[];

  /**
   * Other capabilities that must be applied first.
   * For example, 'add-return-type' might require 'infer-types' first.
   */
  readonly dependsOn?: string[];
}

// ============================================================================
// Language Provider (Core Contract)
// ============================================================================

/**
 * The main contract that any language must implement to participate
 * in AST-based Agent Booster transforms.
 *
 * Lifecycle: create -> initialize -> (parse/transform/print)* -> dispose
 *
 * Thread safety: Providers must be safe for concurrent parse/transform/print
 * calls on different ASTHandles. Operations on the same ASTHandle are
 * sequential (enforced by the orchestrator).
 */
export interface LanguageProvider {
  /** Unique provider identifier (e.g., 'typescript-tsmorph', 'go-goast'). */
  readonly id: string;

  /** Human-readable name. */
  readonly name: string;

  /** Provider version (semver). */
  readonly version: string;

  /** Languages this provider supports (e.g., ['typescript', 'tsx']). */
  readonly languages: readonly string[];

  /** File extensions this provider handles (e.g., ['.ts', '.tsx']). */
  readonly extensions: readonly string[];

  // -- Lifecycle --

  /**
   * Initialize the provider. Load WASM modules, warm up caches, etc.
   * Called once before any parse/transform/print calls.
   */
  initialize(config: ProviderConfig): Promise<void>;

  /**
   * Release all resources. Called during shutdown.
   * After dispose, no other methods may be called.
   */
  dispose(): Promise<void>;

  // -- Core operations --

  /**
   * Parse source code into an AST.
   * The returned ASTHandle is opaque — only this provider can operate on it.
   */
  parse(source: string, options?: ParseOptions): Promise<ParseResult>;

  /**
   * Apply one or more transform instructions to an AST.
   * Instructions are applied in order. If one fails, subsequent instructions
   * may be skipped depending on the error recovery policy.
   */
  transform(ast: ASTHandle, instructions: TransformInstruction[]): Promise<TransformResult>;

  /**
   * Print an AST back to source code.
   * Should preserve comments and formatting when the AST was parsed with
   * preserveTrivia: true and PrintOptions.style is 'preserve'.
   */
  print(ast: ASTHandle, options?: PrintOptions): Promise<PrintResult>;

  /**
   * Validate that an AST is structurally sound.
   * Run after transforms to catch structural issues before printing.
   */
  validate(ast: ASTHandle): Promise<ValidationResult>;

  // -- Capability introspection --

  /**
   * Return all transform capabilities this provider supports.
   * Used by the router to match transforms to providers and estimate tiers.
   */
  getCapabilities(): TransformCapability[];

  /**
   * Check if this provider can handle a specific transform type.
   * Faster than scanning getCapabilities() for a single check.
   */
  supportsTransform(transformType: string): boolean;

  // -- Optional type-aware operations --

  /**
   * Infer or check types for the AST.
   * Only available when the provider has type-checking capabilities
   * (e.g., TypeScript Compiler API, gopls integration).
   * Returns null if not supported.
   */
  getTypeInfo?(ast: ASTHandle): Promise<TypeInfo | null>;
}

/**
 * Configuration passed to a provider during initialization.
 */
export interface ProviderConfig {
  /** Path to WASM module, if the provider uses one. */
  wasmPath?: string;

  /** Working directory for resolving imports/dependencies. */
  workingDirectory?: string;

  /** Maximum memory budget in bytes for this provider. */
  maxMemoryBytes?: number;

  /** Timeout for individual operations (parse, transform, print) in ms. */
  operationTimeoutMs?: number;

  /** Language-specific compiler/parser options. */
  languageOptions?: Record<string, unknown>;

  /** Shared cache for cross-provider optimization. */
  cache?: ProviderCache;
}

/**
 * Shared cache interface for providers.
 */
export interface ProviderCache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs?: number): void;
  has(key: string): boolean;
  delete(key: string): void;
  clear(): void;
}

/**
 * Type information extracted from a typed AST.
 */
export interface TypeInfo {
  /** Get the inferred type for a node. */
  typeOf(nodeRef: ASTNodeRef): TypeDescriptor | null;

  /** Get all symbols visible in a scope. */
  symbolsInScope(nodeRef: ASTNodeRef): SymbolDescriptor[];

  /** Check assignability between two types. */
  isAssignable(source: TypeDescriptor, target: TypeDescriptor): boolean;
}

export interface TypeDescriptor {
  readonly text: string;
  readonly kind: 'primitive' | 'object' | 'function' | 'union' | 'intersection' | 'generic' | 'unknown';
  readonly nullable: boolean;
}

export interface SymbolDescriptor {
  readonly name: string;
  readonly kind: 'variable' | 'function' | 'class' | 'interface' | 'type' | 'enum' | 'module' | 'parameter';
  readonly type: TypeDescriptor;
  readonly exported: boolean;
}

// ============================================================================
// Language Provider Registry
// ============================================================================

/**
 * Registry for discovering and selecting language providers.
 *
 * The registry is the single entry point for the transform pipeline.
 * It handles provider discovery, language detection, and lifecycle.
 */
export interface LanguageProviderRegistry {
  /**
   * Register a provider. Throws if a provider with the same ID
   * is already registered.
   */
  register(provider: LanguageProvider): void;

  /**
   * Unregister a provider by ID. Calls dispose() on the provider.
   */
  unregister(providerId: string): Promise<void>;

  /**
   * Get a provider for a specific language.
   * Returns the highest-priority provider for that language, or null.
   */
  getProvider(language: string): LanguageProvider | null;

  /**
   * Get a provider by its unique ID.
   */
  getProviderById(providerId: string): LanguageProvider | null;

  /**
   * Get all registered providers.
   */
  getAllProviders(): LanguageProvider[];

  /**
   * Get all languages that have at least one registered provider.
   */
  getSupportedLanguages(): string[];

  /**
   * Detect the language for a file based on extension and optional content.
   * Uses registered providers' extension lists, then falls back to
   * content-based heuristics (shebang, magic comments).
   */
  detectLanguage(filePath: string, content?: string): string | null;

  /**
   * Find the best provider for a specific transform on a specific language.
   * May differ from getProvider() if multiple providers support the language
   * but only one supports the requested transform type.
   */
  findProviderForTransform(language: string, transformType: string): LanguageProvider | null;

  /**
   * Get all capabilities across all providers for a given language.
   * Useful for building UIs that show available transforms.
   */
  getCapabilitiesForLanguage(language: string): TransformCapability[];

  /**
   * Initialize all registered providers. Called once during system startup.
   */
  initializeAll(config: RegistryConfig): Promise<InitializeResult>;

  /**
   * Dispose all providers. Called during system shutdown.
   */
  disposeAll(): Promise<void>;
}

export interface RegistryConfig {
  /** Default config applied to all providers (overridable per-provider). */
  defaults: Partial<ProviderConfig>;

  /** Per-provider config overrides keyed by provider ID. */
  providerOverrides?: Record<string, Partial<ProviderConfig>>;

  /** Priority ordering when multiple providers handle the same language. */
  providerPriority?: string[];
}

export interface InitializeResult {
  readonly initialized: string[];
  readonly failed: Array<{ providerId: string; error: string }>;
  readonly totalTimeMs: number;
}

// ============================================================================
// Plugin Lifecycle for Language Providers
// ============================================================================

/**
 * Factory function for dynamically loading a language provider.
 *
 * Language providers can be distributed as:
 * 1. Built-in providers (bundled with Agent Booster)
 * 2. npm packages (e.g., @claude-flow/lang-python)
 * 3. WASM modules loaded at runtime
 *
 * The factory pattern decouples provider creation from registration,
 * enabling lazy loading and WASM module initialization.
 */
export interface LanguageProviderFactory {
  /** Unique factory identifier. */
  readonly id: string;

  /** Languages this factory can create providers for. */
  readonly languages: readonly string[];

  /** Estimated memory footprint in bytes. Used for resource budgeting. */
  readonly estimatedMemoryBytes: number;

  /** Whether this factory requires a WASM runtime. */
  readonly requiresWasm: boolean;

  /**
   * Create and return a provider instance.
   * The provider is NOT initialized — the caller must call initialize().
   */
  create(): Promise<LanguageProvider>;

  /**
   * Check if the factory's dependencies are available.
   * For example, a tree-sitter provider checks for the WASM binary.
   */
  checkDependencies(): Promise<DependencyCheckResult>;
}

export interface DependencyCheckResult {
  readonly satisfied: boolean;
  readonly missing: string[];
  readonly optional: string[];
}

/**
 * Lifecycle state for a managed provider.
 */
export type ProviderState =
  | 'unloaded'
  | 'loading'
  | 'initialized'
  | 'error'
  | 'disposed';

/**
 * Managed wrapper around a LanguageProvider that tracks lifecycle state.
 * Used internally by the registry.
 */
export interface ManagedProvider {
  readonly provider: LanguageProvider;
  readonly state: ProviderState;
  readonly factory: LanguageProviderFactory;
  readonly loadedAt?: Date;
  readonly error?: Error;
  readonly metrics: ProviderMetrics;
}

export interface ProviderMetrics {
  parseCount: number;
  transformCount: number;
  printCount: number;
  totalParseTimeMs: number;
  totalTransformTimeMs: number;
  totalPrintTimeMs: number;
  errorCount: number;
  lastUsedAt?: Date;
}

// ============================================================================
// Integration with 3-Tier Model Router (ADR-026)
// ============================================================================

/**
 * Bridge between the Language Provider system and the existing
 * EnhancedModelRouter from ADR-026.
 *
 * The current Agent Booster uses regex-based intent matching to detect
 * simple transforms (var-to-const, add-types, etc.). The new AST-based
 * system replaces this with real parsing and capability matching.
 *
 * This interface defines how the two systems connect during migration.
 */
export interface ASTRouterBridge {
  /**
   * Analyze a task description and source code to determine:
   * 1. Can this be handled by AST transforms? (Tier 1)
   * 2. Which transforms are needed?
   * 3. Which provider handles them?
   *
   * Returns null if the task is not suitable for AST transforms
   * (falls through to Tier 2/3 LLM routing).
   */
  analyzeForASTTransform(
    taskDescription: string,
    sourceCode: string,
    filePath: string
  ): Promise<ASTRouteResult | null>;
}

export interface ASTRouteResult {
  /** The provider that will handle the transform. */
  readonly providerId: string;

  /** The language detected for the source code. */
  readonly language: string;

  /** Transform instructions derived from the task description. */
  readonly instructions: TransformInstruction[];

  /** Combined complexity estimate (max of individual instruction complexities). */
  readonly complexityEstimate: number;

  /** Confidence that AST transforms can fully handle this task (0-1). */
  readonly confidence: number;

  /** Whether this should be routed to Tier 1 (WASM, <1ms, $0). */
  readonly canHandleAsTier1: boolean;
}
