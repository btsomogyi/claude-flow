/**
 * AST Transform Instruction DSL - Core Types
 *
 * Defines the structured instruction format for expressing arbitrary code
 * transformations as serializable JSON data. This serves as the contract
 * between the host orchestrator (TypeScript) and the WASM execution engine.
 *
 * @see ADR-066: AST Transform Instruction DSL
 * @module transform/types
 */

// =============================================================================
// Language
// =============================================================================

/**
 * Supported languages (aligned with Language Provider interface).
 */
export type Language =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'c'
  | 'cpp'
  | 'ruby'
  | 'swift'
  | 'kotlin';

// =============================================================================
// Transform Operations
// =============================================================================

/**
 * All supported primitive operations.
 *
 * Structural: insert, remove, replace, move, wrap, unwrap, extract, inline, clone
 * Naming: rename, rename-pattern
 * Type: annotate-type, change-type, make-generic, add-constraint, widen-type, narrow-type
 * Control flow: wrap-condition, wrap-try-catch, wrap-loop, add-early-return, convert-callback, add-null-check
 * Import: add-import, remove-import, reorganize-imports, change-import-source
 * Declaration: change-visibility, add-modifier, remove-modifier, change-declaration
 * Pattern: apply-pattern, apply-template
 */
export type TransformOperation =
  // Structural
  | 'insert'
  | 'remove'
  | 'replace'
  | 'move'
  | 'wrap'
  | 'unwrap'
  | 'extract'
  | 'inline'
  | 'clone'
  // Naming
  | 'rename'
  | 'rename-pattern'
  // Type
  | 'annotate-type'
  | 'change-type'
  | 'make-generic'
  | 'add-constraint'
  | 'widen-type'
  | 'narrow-type'
  // Control flow
  | 'wrap-condition'
  | 'wrap-try-catch'
  | 'wrap-loop'
  | 'add-early-return'
  | 'convert-callback'
  | 'add-null-check'
  // Import
  | 'add-import'
  | 'remove-import'
  | 'reorganize-imports'
  | 'change-import-source'
  // Declaration
  | 'change-visibility'
  | 'add-modifier'
  | 'remove-modifier'
  | 'change-declaration'
  // Pattern
  | 'apply-pattern'
  | 'apply-template';

// =============================================================================
// Node Selectors
// =============================================================================

/**
 * Selects which AST node(s) to transform.
 * Exactly one primary selector must be specified.
 * Combinators (filter, limit, scope, and/or/not) refine the selection.
 */
export interface NodeSelector {
  // -- Primary selectors (specify exactly one) --

  /** Select by AST node kind(s) */
  kind?: NodeKindSelector;

  /** Select by identifier name */
  name?: NameSelector;

  /** Select by structural path (CSS-selector-like) */
  path?: PathSelector;

  /** Select by tree-sitter query pattern (S-expression) */
  pattern?: PatternSelector;

  /** Select by source position (line/column range) */
  position?: PositionSelector;

  /** Select by semantic role (language-provider resolved) */
  semantic?: SemanticSelector;

  // -- Combinators --

  /** Filter results with a predicate */
  filter?: Predicate;

  /** Limit to first N matches */
  limit?: number;

  /** Restrict search to nodes within this scope */
  scope?: NodeSelector;

  /** All sub-selectors must match (intersection) */
  and?: NodeSelector[];

  /** Any sub-selector must match (union) */
  or?: NodeSelector[];

  /** Invert: exclude nodes matching this selector */
  not?: NodeSelector;
}

/**
 * Select by AST node kind.
 * Uses tree-sitter node types as canonical vocabulary.
 */
export interface NodeKindSelector {
  /** Raw tree-sitter node type(s) to match */
  types?: string[];

  /**
   * Portable alias that maps to language-specific node types.
   * The Language Provider resolves these to concrete tree-sitter types.
   */
  portable?: PortableNodeKind;
}

/**
 * Portable node kind aliases. These map to language-specific AST node types
 * via the Language Provider, enabling cross-language transforms.
 */
export type PortableNodeKind =
  | 'function'
  | 'class'
  | 'method'
  | 'variable'
  | 'parameter'
  | 'import'
  | 'export'
  | 'type-alias'
  | 'interface'
  | 'enum'
  | 'if-statement'
  | 'loop'
  | 'try-catch'
  | 'return'
  | 'call'
  | 'string-literal'
  | 'number-literal'
  | 'block'
  | 'comment';

/**
 * Select by identifier name.
 */
export interface NameSelector {
  /** Exact name match */
  exact?: string;

  /** Regex pattern match */
  regex?: string;

  /** Glob pattern match (e.g., "handle*") */
  glob?: string;

  /** Match any of these names */
  oneOf?: string[];
}

/**
 * Select by structural path in the AST.
 * Uses a CSS-selector-like syntax for tree traversal.
 *
 * Operators:
 *   >   direct child
 *   >>  any descendant
 *   +   next sibling
 *   ~   any following sibling
 *   [attr=value]  attribute filter
 *
 * Example: "function_declaration > parameters > parameter"
 */
export interface PathSelector {
  expression: string;
}

/**
 * Select by tree-sitter query pattern.
 * Uses tree-sitter's S-expression query language.
 *
 * Example: "(function_declaration name: (identifier) @name)"
 * Captures (prefixed with @) are available in transform params as {{capture}}.
 */
export interface PatternSelector {
  /** Tree-sitter S-expression query */
  query: string;

  /** Named captures to extract from matches */
  captures?: string[];
}

/**
 * Select by source code position.
 */
export interface PositionSelector {
  /** Start line (1-indexed) */
  startLine: number;

  /** End line (1-indexed, inclusive) */
  endLine?: number;

  /** Start column (0-indexed) */
  startColumn?: number;

  /** End column (0-indexed) */
  endColumn?: number;
}

/**
 * Select by semantic role.
 * These are higher-level than raw AST queries and are resolved
 * by the Language Provider into concrete NodeSelectors.
 */
export interface SemanticSelector {
  /** The semantic role to select */
  role: SemanticRole;

  /** Additional context (e.g., function name for 'return-value-of') */
  of?: string;
}

export type SemanticRole =
  | 'all-functions'
  | 'all-async-functions'
  | 'all-exported-functions'
  | 'all-classes'
  | 'all-methods-of'
  | 'all-imports'
  | 'all-unused-imports'
  | 'all-parameters-of'
  | 'return-value-of'
  | 'all-variables-in'
  | 'all-string-literals'
  | 'all-console-calls'
  | 'all-type-annotations'
  | 'constructor-of';

// =============================================================================
// Predicates
// =============================================================================

/**
 * Predicate for conditional execution and node filtering.
 * Evaluates to true/false against an AST node.
 */
export interface Predicate {
  /** Predicate type */
  type: PredicateType;

  /** Selector for predicates that query the tree */
  selector?: NodeSelector;

  /** String value for text matching predicates */
  value?: string;

  /** Numeric comparison for count predicates */
  comparison?: NumericComparison;

  /** Sub-predicates for boolean combinators */
  predicates?: Predicate[];
}

export type PredicateType =
  | 'has-child'
  | 'has-ancestor'
  | 'has-sibling'
  | 'matches-text'
  | 'node-count'
  | 'has-type'
  | 'is-exported'
  | 'is-async'
  | 'has-decorator'
  | 'file-matches'
  | 'language-is'
  | 'not'
  | 'and'
  | 'or';

export interface NumericComparison {
  operator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte';
  value: number;
}

// =============================================================================
// Transform Parameters
// =============================================================================

/**
 * Operation-specific parameters.
 * Each operation type uses a subset of these fields.
 */
export interface TransformParams {
  // -- Structural --

  /** Placement relative to target (insert, add-import, add-early-return) */
  position?: 'before' | 'after' | 'prepend' | 'append' | 'replace';

  /** Source code to insert or use as replacement */
  code?: string;

  /**
   * Code template with {{capture}} placeholders.
   * Captures come from PatternSelector or built-in variables:
   *   {{name}} - matched node's identifier name
   *   {{body}} - matched node's body/content
   *   {{type}} - matched node's type annotation
   */
  template?: string;

  /** Destination for move operations */
  destination?: NodeSelector;

  /**
   * Wrapper template for wrap operations.
   * Use {{body}} as placeholder for the wrapped content.
   */
  wrapper?: string;

  // -- Naming --

  /** New name for rename operations */
  newName?: string;

  /** Naming convention for rename-pattern */
  convention?: NamingConvention;

  /** Whether to rename all references (default: true) */
  renameReferences?: boolean;

  // -- Type --

  /** Type expression for type operations */
  typeExpression?: string;

  /** Type parameter name(s) for make-generic */
  typeParams?: string[];

  /** Constraint expression for add-constraint */
  constraint?: string;

  // -- Control flow --

  /** Condition expression for wrap-condition, add-null-check */
  condition?: string;

  /** Catch handler body for wrap-try-catch */
  catchBody?: string;

  /** Error variable name (default: 'error') */
  errorVar?: string;

  /** Finally block body for wrap-try-catch */
  finallyBody?: string;

  /** Loop variable name for wrap-loop */
  loopVar?: string;

  /** Iterable expression for wrap-loop */
  iterable?: string;

  // -- Import --

  /** Import specifiers (named imports) */
  specifiers?: string[];

  /** Module source path */
  source?: string;

  /** Import kind */
  importKind?: 'named' | 'default' | 'namespace' | 'side-effect';

  // -- Declaration --

  /** Visibility modifier */
  visibility?: Visibility;

  /** Keyword modifier */
  modifier?: Modifier;

  /** Declaration keyword kind */
  declarationKind?: DeclarationKind;

  // -- Pattern --

  /** Design pattern name for apply-pattern */
  patternName?: string;

  /** Pattern-specific configuration */
  patternConfig?: Record<string, unknown>;

  /** Template name for apply-template */
  templateName?: string;
}

export type NamingConvention =
  | 'camelCase'
  | 'snake_case'
  | 'PascalCase'
  | 'SCREAMING_SNAKE'
  | 'kebab-case';

export type Visibility =
  | 'public'
  | 'private'
  | 'protected'
  | 'internal'
  | 'pub'
  | 'pub(crate)';

export type Modifier =
  | 'async'
  | 'static'
  | 'export'
  | 'default'
  | 'abstract'
  | 'readonly'
  | 'const'
  | 'mut'
  | 'override'
  | 'virtual'
  | 'unsafe';

export type DeclarationKind = 'var' | 'let' | 'const' | 'val' | 'mut';

// =============================================================================
// Transform Instruction
// =============================================================================

/**
 * A single atomic transform instruction.
 * The fundamental unit of the DSL.
 */
export interface TransformInstruction {
  /** Unique ID (for dependency tracking in composites) */
  id?: string;

  /** The primitive operation to perform */
  operation: TransformOperation;

  /** How to find the target node(s) in the AST */
  target: NodeSelector;

  /** Operation-specific parameters */
  params: TransformParams;

  /** Only apply if all conditions are met */
  conditions?: Predicate[];

  /** Human-readable description */
  description?: string;

  /** Language-specific parameter overrides */
  languageOverrides?: Partial<Record<Language, Partial<TransformParams>>>;
}

// =============================================================================
// Composite Transforms
// =============================================================================

/**
 * A composite transform grouping multiple instructions
 * with execution semantics.
 */
export interface CompositeTransform {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what this transform does */
  description: string;

  /** Ordered list of instructions */
  instructions: TransformInstruction[];

  /** Execution strategy */
  execution: ExecutionStrategy;

  /** Glob patterns for files to apply to */
  filePatterns?: string[];

  /** Only apply to these languages */
  languages?: Language[];

  /** Tags for cataloging and search */
  tags?: string[];
}

/**
 * How to execute a group of instructions.
 */
export interface ExecutionStrategy {
  /**
   * Execution mode:
   * - sequential: Execute in order. Stop on first failure.
   * - transactional: All-or-nothing. Revert all on any failure.
   * - best-effort: Execute all. Report failures without reverting.
   * - conditional-chain: Each step feeds into the next step's condition.
   */
  mode: 'sequential' | 'transactional' | 'best-effort' | 'conditional-chain';

  /** Revert scope for transactional mode */
  revertScope?: 'full' | 'per-file';

  /** Safety limit: max nodes a single instruction can match (default: 1000) */
  maxMatchesPerInstruction?: number;

  /** Max failures before aborting in best-effort mode */
  maxFailures?: number;

  /** Dependency graph: instruction ID -> IDs it depends on */
  dependencies?: Record<string, string[]>;

  /** Dry-run: compute results without writing files */
  dryRun?: boolean;
}

// =============================================================================
// Results
// =============================================================================

/**
 * Result of executing a composite transform.
 */
export interface TransformResult {
  /** Overall success */
  success: boolean;

  /** Per-instruction results */
  instructionResults: InstructionResult[];

  /** Files that were modified */
  filesModified: string[];

  /** Total nodes matched */
  totalNodesMatched: number;

  /** Total nodes transformed */
  totalNodesTransformed: number;

  /** Execution time in milliseconds */
  executionMs: number;

  /** Whether changes were reverted (transactional mode) */
  reverted?: boolean;

  /** Unified diff of all changes */
  diff?: string;
}

/**
 * Result of a single instruction's execution.
 */
export interface InstructionResult {
  /** Instruction ID */
  instructionId?: string;

  /** Whether this instruction succeeded */
  success: boolean;

  /** Nodes matched by the selector */
  nodesMatched: number;

  /** Nodes actually transformed */
  nodesTransformed: number;

  /** Error message if failed */
  error?: string;

  /** Per-file diffs */
  fileDiffs?: FileDiff[];
}

export interface FileDiff {
  file: string;
  diff: string;
}

// =============================================================================
// Natural Language Bridge Types
// =============================================================================

/**
 * Context provided to the NL bridge for resolving instructions.
 */
export interface NLContext {
  /** File being edited */
  filePath?: string;

  /** Language (if known) */
  language?: Language;

  /** Selected code range (editor context) */
  selection?: { startLine: number; endLine: number };

  /** Available symbol names in scope */
  symbols?: string[];

  /** AST summary for LLM context */
  astSummary?: string;
}

/**
 * Result from the NL bridge translation.
 */
export interface NLTranslationResult {
  /** The parsed instructions */
  instructions: TransformInstruction[];

  /** Which stage handled the translation */
  stage: 'rule-engine' | 'llm';

  /** Confidence in the translation (0-1) */
  confidence: number;

  /** The matched rule name (if rule-engine) */
  matchedRule?: string;

  /** Whether the translation should be reviewed before execution */
  requiresReview?: boolean;
}

/**
 * NL rule definition for the rule-based fast path.
 */
export interface NLRule {
  /** Rule identifier */
  id: string;

  /** Regex patterns that activate this rule */
  patterns: RegExp[];

  /** Named capture group names */
  captureNames: string[];

  /** Build instructions from captured values */
  build(captures: Record<string, string>, context?: NLContext): TransformInstruction[];

  /** Confidence score for this rule (0-1) */
  confidence: number;

  /** Human-readable description */
  description: string;
}
