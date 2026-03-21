# ADR-066: AST Transform Instruction DSL

**Status:** Proposed
**Date:** 2026-03-20
**Author:** System Architecture Designer
**Depends on:** ADR-026 (Agent Booster Model Routing)

## Context

The current Agent Booster (ADR-026) handles exactly 6 regex-matched intent types:
`var-to-const`, `add-types`, `add-error-handling`, `async-await`, `add-logging`, `remove-console`.

These are detected via regex patterns in `enhanced-model-router.ts` and mapped to hardcoded instruction strings. This approach cannot scale: every new transform requires new regex patterns, new intent types, and new hardcoded instructions.

The redesigned Agent Booster needs an **instruction DSL** that can express ANY code transformation as structured data, then execute it via AST manipulation at WASM speed (<1ms).

### Precedent Analysis

| System | Instruction Format | Strengths | Weaknesses |
|--------|-------------------|-----------|------------|
| **jscodeshift** | Imperative JS code operating on AST | Full JS expressiveness | JS-only, hard to serialize |
| **Semgrep** | YAML rules with pattern/fix pairs | Declarative, multi-lang | Pattern-only, no structural ops |
| **Coccinelle** | Semantic patches (SmPL) | Precise semantic matching | C-only, steep learning curve |
| **Comby** | Template holes `:[var]` | Simple, language-agnostic | No AST awareness, just structural |
| **GritQL** | SQL-like query + rewrite | Composable, readable | Young ecosystem |
| **ast-grep** | YAML rules with tree-sitter patterns | Fast, multi-lang | Limited transform expressiveness |

**Key insight:** No existing system combines (a) structured/serializable instructions, (b) composable primitive operations, (c) multi-language AST awareness, and (d) a natural language translation layer. Our DSL must fill this gap.

## Decision

Define a three-layer Transform Instruction DSL:

1. **Primitive Operations** -- atomic AST manipulations (add, remove, rename, wrap, etc.)
2. **Node Selectors** -- how to target specific AST nodes for transformation
3. **Composite Transforms** -- how to compose primitives into complex, transactional transforms

Plus a **Natural Language Bridge** that translates free-text instructions into `TransformInstruction[]`.

## Specification

### 1. Instruction Taxonomy (Primitive Operations)

Every code transform decomposes into one or more of these primitive operations:

#### Structural Operations

| Operation | Description | Example |
|-----------|-------------|---------|
| `insert` | Add a new node at a position | Insert a function parameter |
| `remove` | Delete a node | Remove an import statement |
| `replace` | Swap one node for another | Replace `var` with `const` |
| `move` | Relocate a node within the tree | Move a function to a different scope |
| `wrap` | Surround a node with a new parent | Wrap expression in `try/catch` |
| `unwrap` | Remove a wrapping parent, keep children | Remove unnecessary `if` wrapper |
| `extract` | Pull a node out into a new declaration | Extract expression into a variable |
| `inline` | Replace a reference with its definition | Inline a single-use variable |
| `clone` | Duplicate a node | Copy a method to another class |

#### Naming Operations

| Operation | Description | Example |
|-----------|-------------|---------|
| `rename` | Change an identifier name | Rename `handleAuth` to `handle_auth` |
| `rename-pattern` | Batch rename by pattern | camelCase to snake_case for all functions |

#### Type Operations (TypeScript/typed languages)

| Operation | Description | Example |
|-----------|-------------|---------|
| `annotate-type` | Add type annotation | Add `: string` to parameter |
| `change-type` | Modify existing type | Change `any` to `unknown` |
| `make-generic` | Parameterize a type | `Array` to `Array<T>` |
| `add-constraint` | Add type constraint | `T` to `T extends Serializable` |
| `widen-type` | Make type more general | `string` to `string \| number` |
| `narrow-type` | Make type more specific | `unknown` to `string` |

#### Control Flow Operations

| Operation | Description | Example |
|-----------|-------------|---------|
| `wrap-condition` | Wrap in if/else | Add null check guard |
| `wrap-try-catch` | Wrap in try/catch | Add error handling |
| `wrap-loop` | Wrap in for/while | Iterate over collection |
| `add-early-return` | Insert guard clause | `if (!x) return;` at top |
| `convert-callback` | Callback to async/await | `.then()` chain to `await` |
| `add-null-check` | Insert nullish guard | Optional chaining or explicit check |

#### Import/Module Operations

| Operation | Description | Example |
|-----------|-------------|---------|
| `add-import` | Add import statement | `import { X } from 'y'` |
| `remove-import` | Remove import statement | Remove unused import |
| `reorganize-imports` | Sort/group imports | Group by source |
| `change-import-source` | Change module path | `./old` to `./new` |

#### Declaration/Modifier Operations

| Operation | Description | Example |
|-----------|-------------|---------|
| `change-visibility` | public/private/protected | Make field private |
| `add-modifier` | Add keyword modifier | Add `async`, `static`, `export` |
| `remove-modifier` | Remove keyword modifier | Remove `export` |
| `change-declaration` | var/let/const/val/mut | `var` to `const` |

#### Pattern Operations (Compound)

| Operation | Description | Example |
|-----------|-------------|---------|
| `apply-pattern` | Apply a design pattern | Singleton, Factory, Observer |
| `apply-template` | Apply a code template | Error boundary, logging wrapper |

### 2. TransformInstruction Schema

```typescript
// =============================================================================
// Core Types
// =============================================================================

/**
 * A single atomic transform instruction.
 * The fundamental unit of the DSL.
 */
interface TransformInstruction {
  /** Unique ID for this instruction (for dependency tracking) */
  id?: string;

  /** The primitive operation to perform */
  operation: TransformOperation;

  /** How to find the target node(s) in the AST */
  target: NodeSelector;

  /** Operation-specific parameters */
  params: TransformParams;

  /** Only apply if all conditions are met */
  conditions?: Predicate[];

  /** Human-readable description of what this does */
  description?: string;

  /** Language-specific overrides */
  languageOverrides?: Record<Language, Partial<TransformParams>>;
}

/**
 * All supported primitive operations
 */
type TransformOperation =
  // Structural
  | 'insert' | 'remove' | 'replace' | 'move' | 'wrap' | 'unwrap'
  | 'extract' | 'inline' | 'clone'
  // Naming
  | 'rename' | 'rename-pattern'
  // Type
  | 'annotate-type' | 'change-type' | 'make-generic'
  | 'add-constraint' | 'widen-type' | 'narrow-type'
  // Control flow
  | 'wrap-condition' | 'wrap-try-catch' | 'wrap-loop'
  | 'add-early-return' | 'convert-callback' | 'add-null-check'
  // Import
  | 'add-import' | 'remove-import' | 'reorganize-imports' | 'change-import-source'
  // Declaration
  | 'change-visibility' | 'add-modifier' | 'remove-modifier' | 'change-declaration'
  // Pattern
  | 'apply-pattern' | 'apply-template';

/**
 * Supported languages (aligned with Language Provider interface)
 */
type Language =
  | 'typescript' | 'javascript' | 'python' | 'rust'
  | 'go' | 'java' | 'c' | 'cpp' | 'ruby' | 'swift' | 'kotlin';
```

### 3. NodeSelector -- Targeting AST Nodes

```typescript
/**
 * Selects which AST node(s) to transform.
 * Multiple selector types can be combined with AND/OR logic.
 */
interface NodeSelector {
  /**
   * Primary selector strategy.
   * Exactly one of these must be specified.
   */

  /** Select by AST node kind(s) */
  kind?: NodeKindSelector;

  /** Select by identifier name */
  name?: NameSelector;

  /** Select by structural path within the AST */
  path?: PathSelector;

  /** Select by tree-sitter query pattern */
  pattern?: PatternSelector;

  /** Select by source position (line/column range) */
  position?: PositionSelector;

  /** Select by semantic role (e.g., "return value of function X") */
  semantic?: SemanticSelector;

  // ---------------------------------------------------------------
  // Combinators (applied after primary selection)
  // ---------------------------------------------------------------

  /** Further filter results */
  filter?: Predicate;

  /** Limit to first N matches */
  limit?: number;

  /** Select within a parent scope */
  scope?: NodeSelector;

  /** Combine multiple selectors with boolean logic */
  and?: NodeSelector[];
  or?: NodeSelector[];
  not?: NodeSelector;
}

/**
 * Select by AST node kind (language-normalized).
 * Uses tree-sitter node types as the canonical vocabulary.
 */
interface NodeKindSelector {
  /** Node type(s) to match. Supports tree-sitter node names. */
  types: string[];

  /**
   * Portable aliases that map to language-specific node types.
   * e.g., 'function' maps to function_declaration (TS), func_literal (Go),
   * fn_item (Rust), function_definition (Python)
   */
  portable?:
    | 'function' | 'class' | 'method' | 'variable' | 'parameter'
    | 'import' | 'export' | 'type-alias' | 'interface' | 'enum'
    | 'if-statement' | 'loop' | 'try-catch' | 'return' | 'call'
    | 'string-literal' | 'number-literal' | 'block' | 'comment';
}

/**
 * Select by identifier name.
 */
interface NameSelector {
  /** Exact name match */
  exact?: string;

  /** Regex pattern match */
  regex?: string;

  /** Glob pattern match */
  glob?: string;

  /** Match any of these names */
  oneOf?: string[];
}

/**
 * Select by structural path in the AST.
 * Uses a CSS-selector-like syntax for tree traversal.
 */
interface PathSelector {
  /**
   * Path expression.
   * Examples:
   *   "function_declaration > parameters > parameter"
   *   "class_declaration > method_definition[name='render']"
   *   "if_statement > consequence > return_statement"
   *
   * Operators:
   *   >   direct child
   *   >>  any descendant
   *   +   next sibling
   *   ~   any following sibling
   *   [attr=value]  attribute filter
   */
  expression: string;
}

/**
 * Select by tree-sitter query pattern.
 * This is the most powerful selector -- directly uses tree-sitter's
 * S-expression query language.
 */
interface PatternSelector {
  /**
   * Tree-sitter query in S-expression format.
   * Example: "(function_declaration name: (identifier) @name)"
   *
   * Captures (prefixed with @) become available in transform params.
   */
  query: string;

  /** Named captures to extract from matches */
  captures?: string[];
}

/**
 * Select by source code position.
 */
interface PositionSelector {
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
 * Select by semantic role -- higher-level than raw AST queries.
 * These are resolved by the language provider into concrete NodeSelectors.
 */
interface SemanticSelector {
  /** The semantic query */
  role:
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

  /** Additional context for the role (e.g., function name for 'return-value-of') */
  of?: string;
}
```

### 4. Transform Parameters

```typescript
/**
 * Operation-specific parameters.
 * Each operation type uses a subset of these fields.
 */
interface TransformParams {
  // -- Structural params --

  /** For insert: where to place the new node relative to target */
  position?: 'before' | 'after' | 'prepend' | 'append' | 'replace';

  /** For insert/replace: the new code to insert (as source text) */
  code?: string;

  /** For insert/replace: a code template with `{{capture}}` placeholders */
  template?: string;

  /** For move: destination selector */
  destination?: NodeSelector;

  /** For wrap: the wrapper template. Use `{{body}}` for wrapped content. */
  wrapper?: string;

  // -- Naming params --

  /** For rename: the new name */
  newName?: string;

  /** For rename-pattern: naming convention to apply */
  convention?: 'camelCase' | 'snake_case' | 'PascalCase' | 'SCREAMING_SNAKE' | 'kebab-case';

  /** For rename: whether to rename all references (default: true) */
  renameReferences?: boolean;

  // -- Type params --

  /** For type operations: the type expression */
  typeExpression?: string;

  /** For make-generic: type parameter name(s) */
  typeParams?: string[];

  /** For add-constraint: constraint expression */
  constraint?: string;

  // -- Control flow params --

  /** For wrap-condition: the condition expression */
  condition?: string;

  /** For wrap-try-catch: the catch handler body */
  catchBody?: string;

  /** For wrap-try-catch: error variable name (default: 'error') */
  errorVar?: string;

  /** For wrap-try-catch: include finally block */
  finallyBody?: string;

  /** For wrap-loop: loop variable name */
  loopVar?: string;

  /** For wrap-loop: iterable expression */
  iterable?: string;

  // -- Import params --

  /** For add-import: import specifiers */
  specifiers?: string[];

  /** For add-import/change-import-source: module path */
  source?: string;

  /** For add-import: import kind */
  importKind?: 'named' | 'default' | 'namespace' | 'side-effect';

  // -- Declaration params --

  /** For change-visibility */
  visibility?: 'public' | 'private' | 'protected' | 'internal' | 'pub' | 'pub(crate)';

  /** For add-modifier/remove-modifier */
  modifier?: 'async' | 'static' | 'export' | 'default' | 'abstract'
    | 'readonly' | 'const' | 'mut' | 'override' | 'virtual' | 'unsafe';

  /** For change-declaration: target kind */
  declarationKind?: 'var' | 'let' | 'const' | 'val' | 'mut';

  // -- Pattern params --

  /** For apply-pattern: the pattern to apply */
  patternName?: string;

  /** For apply-pattern: pattern-specific config */
  patternConfig?: Record<string, unknown>;

  /** For apply-template: the template name or inline template */
  templateName?: string;
}

/**
 * Predicate for conditional execution and filtering.
 */
interface Predicate {
  /** Predicate type */
  type:
    | 'has-child'       // Node has a child matching selector
    | 'has-ancestor'    // Node has an ancestor matching selector
    | 'has-sibling'     // Node has a sibling matching selector
    | 'matches-text'    // Node source text matches regex
    | 'node-count'      // Number of matched nodes satisfies comparison
    | 'has-type'        // Node has a type annotation
    | 'is-exported'     // Node is exported
    | 'is-async'        // Function/method is async
    | 'has-decorator'   // Node has a specific decorator/attribute
    | 'file-matches'    // File path matches pattern
    | 'language-is'     // Current language matches
    | 'not'             // Negate another predicate
    | 'and'             // All sub-predicates pass
    | 'or';             // Any sub-predicate passes

  /** Selector for predicates that query the tree */
  selector?: NodeSelector;

  /** String value for text matching predicates */
  value?: string;

  /** Numeric comparison for count predicates */
  comparison?: { operator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte'; value: number };

  /** Sub-predicates for boolean combinators */
  predicates?: Predicate[];
}
```

### 5. Composite Transforms (Composability)

```typescript
/**
 * A composite transform that groups multiple instructions
 * with execution semantics.
 */
interface CompositeTransform {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what this transform does */
  description: string;

  /** The ordered list of instructions */
  instructions: TransformInstruction[];

  /** Execution strategy */
  execution: ExecutionStrategy;

  /** Files to apply to (glob patterns) */
  filePatterns?: string[];

  /** Language constraint -- only apply to these languages */
  languages?: Language[];

  /** Metadata for cataloging and search */
  tags?: string[];
}

/**
 * How to execute a group of instructions.
 */
interface ExecutionStrategy {
  /**
   * Execution mode:
   * - 'sequential': Execute in order. If one fails, stop.
   * - 'transactional': All-or-nothing. If any fails, revert all.
   * - 'best-effort': Execute all. Report failures but don't revert.
   * - 'conditional-chain': Each step's output feeds the next step's condition.
   */
  mode: 'sequential' | 'transactional' | 'best-effort' | 'conditional-chain';

  /**
   * For transactional mode: how to handle revert.
   * - 'full': Revert all changes to all files.
   * - 'per-file': Revert only the file that caused the failure.
   */
  revertScope?: 'full' | 'per-file';

  /**
   * Maximum number of nodes a single instruction can match.
   * Safety limit to prevent runaway transforms.
   * Default: 1000
   */
  maxMatchesPerInstruction?: number;

  /**
   * Continue after N failures before aborting (for best-effort mode).
   * Default: unlimited for best-effort, 0 for sequential/transactional.
   */
  maxFailures?: number;

  /**
   * Dependency graph between instructions (by ID).
   * If specified, instructions execute in dependency order
   * rather than list order.
   */
  dependencies?: Record<string, string[]>;

  /**
   * Enable dry-run mode -- compute results but don't write files.
   */
  dryRun?: boolean;
}

/**
 * Result of executing a composite transform.
 */
interface TransformResult {
  /** Overall success/failure */
  success: boolean;

  /** Per-instruction results */
  instructionResults: InstructionResult[];

  /** Files modified */
  filesModified: string[];

  /** Total nodes matched across all instructions */
  totalNodesMatched: number;

  /** Total nodes transformed */
  totalNodesTransformed: number;

  /** Execution time in milliseconds */
  executionMs: number;

  /** If transactional and reverted, the revert info */
  reverted?: boolean;

  /** Diff of all changes (unified diff format) */
  diff?: string;
}

interface InstructionResult {
  /** Instruction ID */
  instructionId?: string;

  /** Whether this instruction succeeded */
  success: boolean;

  /** Number of nodes matched */
  nodesMatched: number;

  /** Number of nodes actually transformed */
  nodesTransformed: number;

  /** Error message if failed */
  error?: string;

  /** Per-file diffs */
  fileDiffs?: Array<{ file: string; diff: string }>;
}
```

### 6. Natural Language Bridge

The NL bridge translates free-text instructions into `TransformInstruction[]`. It operates in two stages:

**Stage 1: Rule-Based Fast Path (< 1ms, covers ~60% of instructions)**

```typescript
/**
 * Rule-based NL-to-DSL translator.
 * Handles common patterns without LLM invocation.
 */
interface NLRuleEngine {
  /**
   * Try to parse a natural language instruction into structured transforms.
   * Returns null if the instruction is too complex for rule-based parsing.
   */
  parse(input: string, context?: NLContext): TransformInstruction[] | null;
}

interface NLContext {
  /** The file being edited (for language detection) */
  filePath?: string;

  /** The language (if known) */
  language?: Language;

  /** The selected code range (if in an editor context) */
  selection?: { startLine: number; endLine: number };

  /** Available function/class names in scope */
  symbols?: string[];
}

/**
 * NL rule definitions.
 * Each rule maps a pattern to a structured instruction builder.
 */
interface NLRule {
  /** Regex patterns that activate this rule */
  patterns: RegExp[];

  /** Named capture groups to extract from the match */
  captures: string[];

  /** Build the instruction(s) from captured values */
  build(captures: Record<string, string>, context?: NLContext): TransformInstruction[];

  /** Confidence score for this rule (0-1) */
  confidence: number;
}

/**
 * Example rules (extends the current 6 intents to ~40):
 */
const EXAMPLE_RULES: NLRule[] = [
  {
    // "rename X to Y" / "rename function X to Y"
    patterns: [/rename\s+(?:function|method|class|variable|type)?\s*['"`]?(\w+)['"`]?\s+to\s+['"`]?(\w+)['"`]?/i],
    captures: ['oldName', 'newName'],
    confidence: 0.95,
    build: (captures) => [{
      operation: 'rename',
      target: { name: { exact: captures.oldName } },
      params: { newName: captures.newName, renameReferences: true },
    }],
  },
  {
    // "add error handling to all async functions"
    patterns: [/add\s+error\s+handling\s+to\s+(?:all\s+)?(?:async\s+)?functions?/i],
    captures: [],
    confidence: 0.85,
    build: (_captures, context) => [{
      operation: 'wrap-try-catch',
      target: {
        semantic: { role: 'all-async-functions' },
        scope: context?.filePath
          ? { position: { startLine: 1, endLine: 99999 } }
          : undefined,
      },
      params: {
        catchBody: 'console.error(error);\nthrow error;',
        errorVar: 'error',
      },
    }],
  },
  {
    // "convert var to const"
    patterns: [/convert\s+var\s+to\s+const/i, /var\s*(?:to|->|=>)\s*const/i],
    captures: [],
    confidence: 0.95,
    build: () => [{
      operation: 'change-declaration',
      target: { kind: { portable: 'variable' }, filter: { type: 'matches-text', value: '^var\\s' } },
      params: { declarationKind: 'const' },
    }],
  },
  {
    // "make function X async"
    patterns: [/make\s+(?:function\s+)?['"`]?(\w+)['"`]?\s+async/i],
    captures: ['funcName'],
    confidence: 0.90,
    build: (captures) => [{
      operation: 'add-modifier',
      target: { kind: { portable: 'function' }, name: { exact: captures.funcName } },
      params: { modifier: 'async' },
    }],
  },
  {
    // "extract variable from <expression>"
    patterns: [/extract\s+(?:a\s+)?(?:local\s+)?variable\s+(?:for|from)\s+(.+)/i],
    captures: ['expression'],
    confidence: 0.80,
    build: (captures) => [{
      operation: 'extract',
      target: { pattern: { query: `("${captures.expression}")` } },
      params: { newName: 'extracted' },
    }],
  },
  {
    // "add import { X } from 'Y'" / "import X from Y"
    patterns: [
      /(?:add\s+)?import\s+\{\s*(.+?)\s*\}\s+from\s+['"](.+?)['"]/i,
      /(?:add\s+)?import\s+(\w+)\s+from\s+['"](.+?)['"]/i,
    ],
    captures: ['specifiers', 'source'],
    confidence: 0.95,
    build: (captures) => [{
      operation: 'add-import',
      target: { kind: { portable: 'import' } },
      params: {
        specifiers: captures.specifiers.split(',').map(s => s.trim()),
        source: captures.source,
        importKind: captures.specifiers.includes('{') ? 'named' : 'default',
        position: 'prepend',
      },
    }],
  },
  {
    // "remove unused imports"
    patterns: [/remove\s+(?:all\s+)?unused\s+imports?/i],
    captures: [],
    confidence: 0.90,
    build: () => [{
      operation: 'remove',
      target: { semantic: { role: 'all-unused-imports' } },
      params: {},
    }],
  },
  {
    // "add null check for X" / "add guard clause for X"
    patterns: [/add\s+(?:null\s+check|guard\s+clause)\s+(?:for|to)\s+['"`]?(\w+)['"`]?/i],
    captures: ['varName'],
    confidence: 0.85,
    build: (captures) => [{
      operation: 'add-early-return',
      target: {
        kind: { portable: 'function' },
        filter: { type: 'has-child', selector: { name: { exact: captures.varName } } },
      },
      params: {
        condition: `!${captures.varName}`,
        code: `if (!${captures.varName}) {\n  throw new Error('${captures.varName} is required');\n}`,
        position: 'prepend',
      },
    }],
  },
];
```

**Stage 2: LLM-Assisted Complex Path (for instructions the rule engine cannot handle)**

```typescript
/**
 * LLM-based NL-to-DSL translator for complex instructions.
 * Uses a small model (Haiku) with a structured output schema.
 */
interface NLLLMTranslator {
  /**
   * Translate a natural language instruction to structured transforms
   * using an LLM with schema-constrained output.
   */
  translate(
    input: string,
    context: NLContext & {
      /** AST summary of the target file (function names, class names, etc.) */
      astSummary?: string;
    }
  ): Promise<TransformInstruction[]>;
}

/**
 * The LLM receives a system prompt containing:
 * 1. The TransformInstruction JSON schema
 * 2. The list of valid operations
 * 3. Example input/output pairs (few-shot)
 * 4. The file's AST summary (symbol table)
 *
 * And is asked to output valid JSON matching the schema.
 *
 * Model selection: Haiku for cost efficiency (~$0.0002 per translation).
 * Latency: ~500ms (acceptable since complex transforms are Tier 2+).
 *
 * Validation: The LLM output is parsed and validated against the
 * TransformInstruction schema before execution. Invalid output is
 * rejected with a descriptive error.
 */
```

**Combined Pipeline:**

```
Natural Language Input
        |
        v
  [Rule Engine] --match--> TransformInstruction[] (< 1ms)
        |
        | no match
        v
  [LLM Translator] --schema-constrained--> TransformInstruction[] (~500ms)
        |
        v
  [Schema Validator] --validates--> Execute or Reject
```

### 7. Concrete Examples

#### Example 1: "Convert var to const" (maps to current `var-to-const`)

```json
{
  "operation": "change-declaration",
  "target": {
    "kind": { "portable": "variable" },
    "filter": { "type": "matches-text", "value": "^var\\s" }
  },
  "params": {
    "declarationKind": "const"
  }
}
```

#### Example 2: "Add error handling to all async functions" (maps to current `add-error-handling`)

```json
{
  "operation": "wrap-try-catch",
  "target": {
    "semantic": { "role": "all-async-functions" }
  },
  "params": {
    "catchBody": "console.error('Error in {{name}}:', error);\nthrow error;",
    "errorVar": "error"
  }
}
```

#### Example 3: "Rename function handleAuth to handleAuthentication and update all call sites"

```json
{
  "operation": "rename",
  "target": {
    "kind": { "portable": "function" },
    "name": { "exact": "handleAuth" }
  },
  "params": {
    "newName": "handleAuthentication",
    "renameReferences": true
  }
}
```

#### Example 4: "Extract the database query into a separate function" (complex, multi-step)

```json
{
  "id": "extract-db",
  "name": "Extract database query",
  "description": "Extract inline database query into a named function",
  "instructions": [
    {
      "id": "find-query",
      "operation": "extract",
      "target": {
        "pattern": {
          "query": "(call_expression function: (member_expression object: (identifier) @obj property: (property_identifier) @prop) (#eq? @obj \"db\")) @call"
        }
      },
      "params": {
        "newName": "fetchUserData"
      },
      "description": "Extract db.query(...) call into a new function"
    },
    {
      "id": "add-type",
      "operation": "annotate-type",
      "target": {
        "name": { "exact": "fetchUserData" }
      },
      "params": {
        "typeExpression": "Promise<User[]>"
      },
      "description": "Add return type to extracted function"
    },
    {
      "id": "make-async",
      "operation": "add-modifier",
      "target": {
        "name": { "exact": "fetchUserData" }
      },
      "params": {
        "modifier": "async"
      },
      "description": "Make extracted function async"
    }
  ],
  "execution": {
    "mode": "transactional",
    "dependencies": {
      "add-type": ["find-query"],
      "make-async": ["find-query"]
    }
  }
}
```

#### Example 5: "Add logging to all exported functions" (multi-language)

```json
{
  "operation": "wrap",
  "target": {
    "semantic": { "role": "all-exported-functions" }
  },
  "params": {
    "wrapper": "{{body}}",
    "template": "console.log('Entering {{name}}', ...arguments);\ntry {\n  {{body}}\n} finally {\n  console.log('Exiting {{name}}');\n}"
  },
  "languageOverrides": {
    "python": {
      "template": "print(f'Entering {{name}}')\ntry:\n    {{body}}\nfinally:\n    print(f'Exiting {{name}}')"
    },
    "go": {
      "template": "fmt.Printf(\"Entering {{name}}\\n\")\ndefer fmt.Printf(\"Exiting {{name}}\\n\")\n{{body}}"
    },
    "rust": {
      "template": "tracing::info!(\"Entering {{name}}\");\nlet _guard = scopeguard::guard((), |_| tracing::info!(\"Exiting {{name}}\"));\n{{body}}"
    }
  }
}
```

#### Example 6: "Convert all callbacks to async/await" (maps to current `async-await`)

```json
{
  "operation": "convert-callback",
  "target": {
    "pattern": {
      "query": "(call_expression function: (member_expression property: (property_identifier) @method (#eq? @method \"then\"))) @call",
      "captures": ["call", "method"]
    }
  },
  "params": {},
  "description": "Convert .then() chains to async/await syntax"
}
```

#### Example 7: Conditional transform -- "Make all functions that use `await` async if they aren't already"

```json
{
  "operation": "add-modifier",
  "target": {
    "kind": { "portable": "function" },
    "filter": {
      "type": "and",
      "predicates": [
        { "type": "has-child", "selector": { "kind": { "types": ["await_expression"] } } },
        { "type": "not", "predicates": [{ "type": "is-async" }] }
      ]
    }
  },
  "params": {
    "modifier": "async"
  }
}
```

### 8. Migration from Current Intent System

The existing 6 intents map directly to DSL instructions:

| Current Intent | DSL Operation | DSL Target |
|----------------|--------------|------------|
| `var-to-const` | `change-declaration` | `kind: { portable: 'variable' }` + text filter |
| `add-types` | `annotate-type` | `semantic: { role: 'all-parameters-of' }` + `kind: { portable: 'function' }` |
| `add-error-handling` | `wrap-try-catch` | `semantic: { role: 'all-async-functions' }` |
| `async-await` | `convert-callback` | `pattern: { query: '..then...' }` |
| `add-logging` | `wrap` with template | `semantic: { role: 'all-functions' }` |
| `remove-console` | `remove` | `semantic: { role: 'all-console-calls' }` |

The `INTENT_PATTERNS` regex map in `enhanced-model-router.ts` becomes the first 6 rules in the NL Rule Engine, preserving backward compatibility.

### 9. Execution Pipeline

```
                          +-------------------+
                          |  Natural Language  |
                          |    Instruction     |
                          +--------+----------+
                                   |
                          +--------v----------+
                          |  NL Bridge        |
                          |  (Rule Engine or  |
                          |   LLM Translator) |
                          +--------+----------+
                                   |
                          +--------v----------+
                          | TransformInstruction[]  |
                          +--------+----------+
                                   |
                          +--------v----------+
                          |  Schema Validator |
                          +--------+----------+
                                   |
                          +--------v----------+
                          |  Language Provider |
                          |  (parse source,   |
                          |   resolve selectors|
                          |   to concrete AST  |
                          |   nodes)           |
                          +--------+----------+
                                   |
                          +--------v----------+
                          |  Node Resolver    |
                          |  (evaluate        |
                          |   selectors,      |
                          |   apply predicates|
                          |   yield matched   |
                          |   nodes)          |
                          +--------+----------+
                                   |
                          +--------v----------+
                          |  Transform Engine |
                          |  (apply operation |
                          |   to each matched |
                          |   node, generate  |
                          |   new AST)        |
                          +--------+----------+
                                   |
                          +--------v----------+
                          |  Formatter        |
                          |  (print modified  |
                          |   AST back to     |
                          |   source text,    |
                          |   preserve style) |
                          +--------+----------+
                                   |
                          +--------v----------+
                          |  TransformResult  |
                          +-------------------+
```

### 10. Integration with WASM Runtime

The DSL is designed to be serializable as JSON. This means:

1. **The NL Bridge and Schema Validator run in the host** (Node.js/TypeScript).
2. **The serialized `TransformInstruction[]` is passed to the WASM runtime** as a JSON message.
3. **The WASM runtime** (containing tree-sitter parsers and the transform engine) executes the instructions and returns the `TransformResult` as JSON.

This clean serialization boundary means the DSL types serve as the **contract between the host orchestrator and the WASM execution engine**, enabling the <1ms execution target for Tier 1 transforms.

```
Host (TypeScript)                    WASM Runtime
+------------------+                 +------------------+
| NL Bridge        |  JSON message   | tree-sitter      |
| Schema Validator | --------------> | Node Resolver    |
| Result Handler   | <-------------- | Transform Engine |
+------------------+  JSON result    | Formatter        |
                                     +------------------+
```

## Consequences

### Positive

1. **Unlimited transform vocabulary**: Any code transformation can be expressed, not just 6 hardcoded intents.
2. **Multi-language by design**: `languageOverrides` and portable selectors handle language differences cleanly.
3. **Composable**: Complex transforms decompose into primitive instructions with dependency ordering.
4. **Serializable**: JSON-based schema enables WASM boundary crossing and persistence.
5. **Backward compatible**: The 6 existing intents map directly to DSL instructions.
6. **Extensible NL bridge**: New patterns can be added to the rule engine without code changes; the LLM fallback handles novel instructions.
7. **Testable**: Each instruction is a pure data structure that can be unit-tested independently.
8. **Auditable**: The instruction chain provides a complete record of what was transformed and why.

### Negative

1. **Schema complexity**: The full schema is large. Implementations must handle all operation/selector combinations.
2. **LLM dependency for complex instructions**: Stage 2 of the NL bridge requires an LLM call (~500ms, ~$0.0002).
3. **Semantic selectors require language-specific implementation**: Each `SemanticSelector` role must be resolved by the Language Provider.

### Mitigations

- Start with a subset of operations (the 9 structural + the 6 migrated intents) and expand incrementally.
- The LLM path is only invoked when the rule engine fails; most common transforms should be covered by rules.
- Semantic selectors degrade gracefully: if a language provider doesn't support a role, the transform reports a clear error.

## File Structure

```
v3/@claude-flow/cli/src/
  transform/
    types.ts                  # TransformInstruction, NodeSelector, etc.
    operations.ts             # Operation registry and validation
    selectors.ts              # NodeSelector resolution logic
    predicates.ts             # Predicate evaluation engine
    composite.ts              # CompositeTransform execution engine
    nl-bridge/
      rule-engine.ts          # Rule-based NL parser
      rules/
        structural.ts         # Structural operation rules
        naming.ts             # Rename rules
        imports.ts             # Import rules
        types.ts              # Type annotation rules
        control-flow.ts       # Control flow rules
      llm-translator.ts       # LLM-based fallback translator
      index.ts                # Combined pipeline
    results.ts                # TransformResult types and formatting
    index.ts                  # Public API
```

## References

- ADR-026: Agent Booster Model Routing (current system)
- ADR-066 depends on the Language Provider interface (Task #4)
- ADR-066 depends on the WASM runtime architecture (Task #7)
- jscodeshift: https://github.com/facebook/jscodeshift
- Semgrep: https://semgrep.dev/docs/writing-rules/rule-syntax
- Coccinelle SmPL: https://coccinelle.gitlabpages.inria.fr/website/docs/main_grammar.html
- Comby: https://comby.dev/docs/syntax-reference
- GritQL: https://docs.grit.io/language/overview
- ast-grep: https://ast-grep.github.io/guide/rule-config.html
- tree-sitter query syntax: https://tree-sitter.github.io/tree-sitter/using-parsers/queries
