# ADR-066: Agent Booster Error Handling and Partial-Transform Recovery

**Status:** Proposed
**Date:** 2026-03-20
**Author:** System Architecture Designer
**Task:** #9 (Agent Booster Redesign)

## Context

The redesigned Agent Booster performs AST-based code transforms across multiple languages (Go, Rust, TypeScript, Python). Real-world source code frequently contains syntax errors, and transforms can fail partially. The system must handle these failures gracefully, provide clear feedback, and integrate with the existing 3-tier fallback cascade (AST -> Haiku -> Sonnet/Opus) from ADR-026.

This ADR defines the error taxonomy, transaction semantics, partial recovery strategies, fallback cascade design, validation pipeline, audit trail, and user-facing error messages for the redesigned Agent Booster.

## 1. Error Taxonomy

All failures are categorized into five classes. Each class has a severity, whether it is recoverable, and the recommended fallback behavior.

```
TransformErrorClass
  |-- ParseError          (source code has syntax errors)
  |-- TransformError      (instruction cannot be applied to valid AST)
  |-- PrintError          (AST cannot be serialized back to valid source)
  |-- ValidationError     (output is syntactically valid but semantically wrong)
  |-- RuntimeError        (WASM crash, timeout, OOM)
```

### 1.1 TypeScript Types

```typescript
// ============================================================================
// Error Taxonomy
// ============================================================================

/**
 * All error classes the Agent Booster can produce.
 */
export type TransformErrorClass =
  | 'parse'
  | 'transform'
  | 'print'
  | 'validation'
  | 'runtime';

/**
 * Severity levels aligned with standard logging.
 */
export type ErrorSeverity = 'warning' | 'error' | 'fatal';

/**
 * A single error produced during a transform operation.
 */
export interface TransformError {
  /** Unique error code for programmatic handling, e.g. "PARSE_SYNTAX_001" */
  readonly code: string;

  /** Human-readable error class */
  readonly class: TransformErrorClass;

  /** Severity: warning (recoverable), error (fallback needed), fatal (abort) */
  readonly severity: ErrorSeverity;

  /** User-facing message (actionable, with suggestions) */
  readonly message: string;

  /** Optional: source file location where the error originated */
  readonly location?: SourceLocation;

  /** Optional: what the system attempted */
  readonly attempted?: string;

  /** Optional: suggestion for the user or downstream system */
  readonly suggestion?: string;

  /** Optional: inner error or chain */
  readonly cause?: TransformError | Error;
}

/**
 * Points to a specific location in source code.
 */
export interface SourceLocation {
  readonly filePath: string;
  readonly line: number;
  readonly column: number;
  readonly endLine?: number;
  readonly endColumn?: number;
  /** The source text around the error (for context in messages) */
  readonly snippet?: string;
}
```

### 1.2 Error Code Registry

Each error code follows the pattern `{CLASS}_{SUBCATEGORY}_{NUMBER}`:

| Code | Class | Severity | Description |
|------|-------|----------|-------------|
| `PARSE_SYNTAX_001` | parse | error | Source has syntax errors; parser returned ERROR nodes |
| `PARSE_ENCODING_002` | parse | error | File encoding unsupported or corrupted |
| `PARSE_TOO_LARGE_003` | parse | error | File exceeds maximum parseable size |
| `TRANSFORM_TARGET_NOT_FOUND_001` | transform | error | Target identifier/node not found in AST |
| `TRANSFORM_AMBIGUOUS_TARGET_002` | transform | warning | Multiple matches; unclear which to transform |
| `TRANSFORM_CONFLICTING_003` | transform | error | Instructions conflict (e.g., rename X to Y and X to Z) |
| `TRANSFORM_ALREADY_APPLIED_004` | transform | warning | Transform has no effect (already in target state) |
| `TRANSFORM_UNSUPPORTED_NODE_005` | transform | error | AST node type not supported by this transform |
| `PRINT_SERIALIZATION_001` | print | error | AST cannot be serialized to valid source |
| `PRINT_FORMAT_DIVERGENCE_002` | print | warning | Output formatting differs from input style |
| `VALIDATION_SYNTAX_CHECK_001` | validation | error | Re-parse of output failed; transform produced invalid code |
| `VALIDATION_SEMANTIC_001` | validation | warning | Type checker or linter found issues in output |
| `VALIDATION_DIFF_TOO_LARGE_002` | validation | warning | Transform changed more code than expected |
| `RUNTIME_WASM_CRASH_001` | runtime | fatal | WASM module crashed |
| `RUNTIME_TIMEOUT_002` | runtime | fatal | Transform exceeded time limit |
| `RUNTIME_OOM_003` | runtime | fatal | Out of memory in WASM sandbox |
| `RUNTIME_PROVIDER_INIT_004` | runtime | fatal | Language provider failed to initialize |

## 2. Error-Tolerant Parsing

### 2.1 Strategy Per Language

| Language | Parser | Error Tolerance |
|----------|--------|-----------------|
| Go | `go/parser` | Returns partial AST + `*ast.BadExpr` / `*ast.BadStmt` nodes; error list available |
| Rust | `syn` | `syn::parse_str` fails fast; fallback to `ra_syntax` (lossless, error-tolerant) |
| TypeScript | `ts.createSourceFile` | Always returns full AST; errors in `diagnostics` array; `skipTrivia` continues past errors |
| Universal | tree-sitter | ERROR nodes in CST; sibling nodes remain valid and traversable |

### 2.2 Parse-and-Transform-Valid-Parts Pattern

```typescript
/**
 * Result of error-tolerant parsing.
 */
export interface ErrorTolerantParseResult {
  /** The (possibly partial) AST root node */
  readonly root: ASTNode;

  /** Regions of the source that could not be parsed */
  readonly errorRegions: ReadonlyArray<SourceRegion>;

  /** Whether the entire file parsed successfully */
  readonly isComplete: boolean;

  /** Language-specific diagnostics from the parser */
  readonly diagnostics: ReadonlyArray<ParseDiagnostic>;
}

export interface SourceRegion {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly startLine: number;
  readonly endLine: number;
  readonly originalText: string;
}

export interface ParseDiagnostic {
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly location: SourceLocation;
}
```

**Algorithm:**

1. Parse source with the language provider's error-tolerant mode.
2. Identify all ERROR nodes / bad-expression nodes in the resulting tree.
3. Mark those regions as "frozen" -- transforms must not touch them.
4. Apply transform instructions only to valid subtrees.
5. During printing, splice the frozen regions back verbatim (byte-for-byte) from the original source.
6. If any transform instruction targets a frozen region, report `TRANSFORM_TARGET_NOT_FOUND_001` with a message like "Target is inside a syntax error region (lines 12-15); cannot safely transform."

## 3. Transaction Semantics

### 3.1 TransformTransaction

Transforms run inside a transaction that holds the original source as a rollback point. Two modes are supported:

```typescript
/**
 * Transaction mode for batch transforms.
 */
export type TransactionMode =
  | 'all-or-nothing'   // If any instruction fails, roll back all changes
  | 'best-effort';     // Apply what succeeds, report what failed

/**
 * A transaction wrapping one or more transform instructions applied
 * to a single source file.
 */
export interface TransformTransaction {
  readonly id: string;
  readonly mode: TransactionMode;
  readonly filePath: string;
  readonly originalSource: string;
  readonly language: string;
  readonly instructions: ReadonlyArray<TransformInstruction>;
  readonly startedAt: number;  // Date.now()
}

/**
 * Outcome of committing a transaction.
 */
export interface TransactionOutcome {
  readonly transactionId: string;
  readonly status: 'committed' | 'rolled-back' | 'partial';
  readonly transformedSource?: string;
  readonly results: ReadonlyArray<InstructionResult>;
  readonly duration: number;  // milliseconds
}

/**
 * Result for a single instruction within a transaction.
 */
export interface InstructionResult {
  readonly instructionIndex: number;
  readonly instruction: TransformInstruction;
  readonly status: 'applied' | 'failed' | 'skipped';
  readonly error?: TransformError;
  /** Diff hunk showing what this instruction changed */
  readonly diff?: string;
}
```

### 3.2 Commit/Rollback Protocol

```
BEGIN TRANSACTION (id, mode, originalSource)
  |
  FOR each instruction:
  |   APPLY instruction to current AST
  |   IF success:
  |     record InstructionResult(applied)
  |   ELSE IF mode == 'all-or-nothing':
  |     ROLLBACK to originalSource
  |     return TransactionOutcome(rolled-back)
  |   ELSE (best-effort):
  |     record InstructionResult(failed, error)
  |     continue with next instruction
  |
  VALIDATE output (re-parse, optional type check)
  IF validation fails AND mode == 'all-or-nothing':
    ROLLBACK to originalSource
    return TransactionOutcome(rolled-back)
  |
  COMMIT (return transformed source)
  return TransactionOutcome(committed | partial)
```

**Key guarantee:** The original source string is always retained in memory until the transaction completes, so rollback is a zero-cost operation (just discard the working copy and return the original).

## 4. Partial Transform Recovery

### 4.1 PartialResult

When a batch instruction applies to N targets but fails on some:

```typescript
/**
 * Detailed result of a transform that may partially succeed.
 * Example: "rename all instances of X" finds 10, succeeds on 8, fails on 2.
 */
export interface PartialTransformResult {
  readonly instructionIndex: number;
  readonly instruction: TransformInstruction;

  /** Total number of targets that matched the instruction */
  readonly totalMatches: number;

  /** Number successfully transformed */
  readonly succeeded: number;

  /** Number that failed (with per-failure details) */
  readonly failed: number;

  /** Number intentionally skipped (e.g., already in target state) */
  readonly skipped: number;

  /** Per-match details */
  readonly matches: ReadonlyArray<MatchResult>;

  /** Aggregate status */
  readonly status: 'full-success' | 'partial-success' | 'full-failure';
}

export interface MatchResult {
  readonly matchIndex: number;
  readonly location: SourceLocation;
  readonly status: 'applied' | 'failed' | 'skipped';
  readonly error?: TransformError;
  readonly reason?: string;
}
```

### 4.2 Concrete Scenarios

**Scenario A:** "Rename all instances of `X` to `Y`" finds 10 instances, fails on 2.

- In `all-or-nothing` mode: all 10 are rolled back, user gets `TransactionOutcome(rolled-back)` with details on which 2 failed and why (e.g., "instance on line 45 is inside a string literal, not an identifier").
- In `best-effort` mode: 8 are applied, 2 are reported as failed. User gets `PartialTransformResult { totalMatches: 10, succeeded: 8, failed: 2 }` with per-match details.

**Scenario B:** "Wrap all functions in try-catch" succeeds on the wrapping but the catch block template references an undefined variable.

- The validation stage (re-parse) catches the syntax error.
- In `all-or-nothing`: rolled back entirely. Error: `VALIDATION_SYNTAX_CHECK_001`.
- In `best-effort`: the specific function's try-catch is reverted to original; other functions keep their wrapping.

**Scenario C:** Transform target not found.

- `TRANSFORM_TARGET_NOT_FOUND_001` with suggestion: "Could not find function 'handleAuth' in `file.go` -- did you mean 'HandleAuth'?" (fuzzy match on identifiers within the AST).

## 5. Fallback Cascade

### 5.1 Design

When Tier 1 (AST transform) fails, the system escalates to Tier 2 (Haiku LLM) with contextual information about what was attempted and what failed. This extends the existing pattern in `enhanced-model-router.ts:516-520`.

```typescript
/**
 * Context passed from a failed AST transform to the LLM fallback.
 */
export interface FallbackContext {
  /** The original source code */
  readonly originalSource: string;

  /** The transform instruction that was attempted */
  readonly instruction: TransformInstruction;

  /** The language of the source */
  readonly language: string;

  /** What the AST transform attempted before failing */
  readonly attemptSummary: string;

  /** The specific error(s) that caused the failure */
  readonly errors: ReadonlyArray<TransformError>;

  /** If partial results were produced, include them */
  readonly partialResult?: PartialTransformResult;

  /** The partially-transformed source (if any progress was made) */
  readonly partialSource?: string;

  /** Hints for the LLM (e.g., "focus on lines 40-60 where the error occurred") */
  readonly hints: ReadonlyArray<string>;
}

/**
 * The cascade routing decision.
 */
export interface FallbackDecision {
  /** Which tier to fall back to */
  readonly targetTier: 2 | 3;

  /** Which model to use */
  readonly model: 'haiku' | 'sonnet' | 'opus';

  /** Why this tier was selected */
  readonly reasoning: string;

  /** The constructed LLM prompt (includes context from AST failure) */
  readonly prompt: string;

  /** Estimated cost */
  readonly estimatedCost: number;
}
```

### 5.2 Cascade Rules

```
AST Transform fails
  |
  |-- Error class == 'runtime' (WASM crash, OOM, timeout)
  |     -> Fall back to Tier 2 (Haiku) with original source + instruction
  |        Reasoning: "WASM runtime failure; retrying with LLM"
  |
  |-- Error class == 'parse' (source has syntax errors)
  |     -> Fall back to Tier 2 (Haiku) with original source + instruction
  |        Hint: "Source has syntax errors on lines X-Y; apply transform
  |               to valid parts and preserve error regions"
  |
  |-- Error class == 'transform' (target not found, ambiguous, etc.)
  |     -> Fall back to Tier 2 (Haiku) with:
  |        - Original source
  |        - What was searched for and not found
  |        - Fuzzy-match suggestions from AST
  |        Hint: "AST could not locate target. Possible matches: [list]"
  |
  |-- Error class == 'validation' (output invalid after transform)
  |     -> Fall back to Tier 3 (Sonnet) with:
  |        - Original source
  |        - The broken output
  |        - The validation errors
  |        Hint: "AST transform produced invalid output. Fix these issues: [list]"
  |        Reasoning: "Validation failure requires deeper reasoning"
  |
  |-- Partial success in best-effort mode
  |     -> Fall back to Tier 2 (Haiku) with:
  |        - The partially-transformed source (keep what worked)
  |        - Details of the failed matches
  |        Hint: "Apply the remaining N transforms that the AST engine could
  |               not handle. Preserve the changes already made."
```

### 5.3 Prompt Construction for LLM Fallback

```typescript
function buildFallbackPrompt(ctx: FallbackContext): string {
  const lines: string[] = [];

  lines.push(`Transform the following ${ctx.language} source code.`);
  lines.push(`Instruction: ${ctx.instruction.description}`);
  lines.push('');

  if (ctx.partialSource) {
    lines.push('IMPORTANT: A partial transform was already applied successfully.');
    lines.push('The source below includes those changes. Only fix the remaining issues.');
    lines.push('');
  }

  if (ctx.errors.length > 0) {
    lines.push('Context from the AST engine (which attempted this first):');
    for (const err of ctx.errors) {
      lines.push(`  - ${err.message}`);
      if (err.suggestion) {
        lines.push(`    Suggestion: ${err.suggestion}`);
      }
    }
    lines.push('');
  }

  for (const hint of ctx.hints) {
    lines.push(`Hint: ${hint}`);
  }

  lines.push('');
  lines.push('Source:');
  lines.push('```' + ctx.language);
  lines.push(ctx.partialSource ?? ctx.originalSource);
  lines.push('```');

  return lines.join('\n');
}
```

## 6. Validation Pipeline

### 6.1 Design

After every transform (whether from AST engine or LLM fallback), the output passes through a configurable validation pipeline.

```typescript
/**
 * A single stage in the validation pipeline.
 */
export interface ValidationStage {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;   // If true, failure blocks the transform
  readonly enabled: boolean;    // Can be toggled per-config

  /**
   * Run the validation. Return errors/warnings found.
   */
  validate(input: ValidationInput): Promise<ValidationResult>;
}

export interface ValidationInput {
  readonly originalSource: string;
  readonly transformedSource: string;
  readonly language: string;
  readonly filePath: string;
  readonly instruction: TransformInstruction;
}

export interface ValidationResult {
  readonly stageName: string;
  readonly passed: boolean;
  readonly errors: ReadonlyArray<TransformError>;
  readonly warnings: ReadonlyArray<TransformError>;
  /** Time taken for this stage */
  readonly durationMs: number;
}

/**
 * Configuration for the validation pipeline.
 */
export interface ValidationPipelineConfig {
  readonly stages: ReadonlyArray<ValidationStage>;
  /** Maximum total time for all validation stages */
  readonly timeoutMs: number;
  /** Skip validation entirely (for performance-critical batch mode) */
  readonly skipValidation: boolean;
}
```

### 6.2 Default Stages

| Stage | Required | Description |
|-------|----------|-------------|
| `syntax-reparse` | Yes | Re-parse the output with the same language provider to confirm valid syntax |
| `diff-sanity` | Yes | Verify the diff is non-empty (transform did something) and within bounds (< 50% of file changed, configurable) |
| `comment-preservation` | No | Verify comments from the original are preserved in the output |
| `type-check` (TS only) | No | Run TypeScript type checker on the output |
| `go-vet` (Go only) | No | Run `go vet` equivalent checks |
| `format-consistency` | No | Verify output formatting is consistent with input (indentation style, line endings) |

### 6.3 Pipeline Execution

```
transformedSource
  |
  [syntax-reparse] --FAIL--> TransformError(VALIDATION_SYNTAX_CHECK_001)
  |
  [diff-sanity] --FAIL--> TransformError(VALIDATION_DIFF_TOO_LARGE_002)
  |
  [comment-preservation] --WARN--> Warning logged, continue
  |
  [type-check] --FAIL--> TransformError(VALIDATION_SEMANTIC_001)
  |
  [format-consistency] --WARN--> Warning logged, continue
  |
  PASS -> output is valid
```

## 7. User-Facing Error Messages

### 7.1 Message Design Principles

1. **State what happened** (not just an error code).
2. **State where** (file, line, column).
3. **Suggest what to do** (actionable next step or fuzzy-match alternative).
4. **State partial progress** (if best-effort mode produced partial results).

### 7.2 Concrete Examples

```
ERROR [TRANSFORM_TARGET_NOT_FOUND_001] in handlers/auth.go:
  Could not find function 'handleAuth'.
  Did you mean 'HandleAuth' (line 42)?

WARNING [TRANSFORM_ALREADY_APPLIED_004] in utils/format.ts:
  Transform 'var-to-const' has no effect: all declarations are already const.

PARTIAL [TRANSFORM_TARGET_NOT_FOUND_001] in services/user.go:
  Transform 'wrap-in-try-catch' partially applied:
    3/5 functions wrapped successfully
    2/5 skipped:
      - 'init()' at line 12: function is a single return statement (nothing to wrap)
      - 'Close()' at line 89: already has error handling

ERROR [VALIDATION_SYNTAX_CHECK_001] in api/server.ts:
  Transform 'async-await' produced invalid syntax.
  Re-parse found error at line 34, column 12: unexpected token 'await' outside async function.
  Rolling back to original source.
  Falling back to Haiku LLM for this transform.

FATAL [RUNTIME_WASM_CRASH_001]:
  Go AST engine crashed while processing handlers/auth.go.
  The WASM module will be restarted for the next operation.
  Falling back to Sonnet LLM for this transform.

INFO [TRANSFORM]:
  Transaction completed in best-effort mode:
    Applied: 8/10 instructions
    Failed:  1/10 (TRANSFORM_CONFLICTING_003 at instruction #4)
    Skipped: 1/10 (TRANSFORM_ALREADY_APPLIED_004 at instruction #7)
  Use --mode all-or-nothing to require all instructions to succeed.
```

### 7.3 Error Formatter Interface

```typescript
/**
 * Formats TransformErrors into user-facing strings.
 */
export interface ErrorFormatter {
  /**
   * Format a single error for terminal/log output.
   */
  formatError(error: TransformError): string;

  /**
   * Format a TransactionOutcome summary.
   */
  formatOutcome(outcome: TransactionOutcome): string;

  /**
   * Format a PartialTransformResult.
   */
  formatPartial(result: PartialTransformResult): string;

  /**
   * Format a FallbackDecision notification.
   */
  formatFallback(decision: FallbackDecision): string;
}
```

## 8. Audit Trail

### 8.1 TransformAuditEntry

Every transform is logged for debugging, reversal, and pattern learning.

```typescript
/**
 * A single audit log entry for a transform operation.
 */
export interface TransformAuditEntry {
  /** Unique ID for this audit entry */
  readonly id: string;

  /** Timestamp when the transform started */
  readonly timestamp: number;

  /** Duration in milliseconds */
  readonly durationMs: number;

  /** File that was transformed */
  readonly filePath: string;

  /** Language of the source */
  readonly language: string;

  /** Which language provider was used */
  readonly provider: string;

  /** The transform instruction(s) */
  readonly instructions: ReadonlyArray<TransformInstruction>;

  /** Transaction mode used */
  readonly transactionMode: TransactionMode;

  /** The original source (before) */
  readonly beforeSource: string;

  /** The transformed source (after), or null if rolled back */
  readonly afterSource: string | null;

  /** The transaction outcome */
  readonly outcome: TransactionOutcome;

  /** If fallback was triggered, details of the cascade */
  readonly fallback?: FallbackDecision;

  /** Validation results */
  readonly validationResults: ReadonlyArray<ValidationResult>;

  /** Which tier ultimately produced the result */
  readonly resolvedTier: 1 | 2 | 3;

  /** Agent/user that requested the transform */
  readonly requestedBy?: string;
}
```

### 8.2 Audit Store Interface

```typescript
/**
 * Persistent store for audit entries.
 * Implementation: stored in AgentDB memory backend (SQLite + HNSW).
 */
export interface AuditStore {
  /** Record a new audit entry */
  record(entry: TransformAuditEntry): Promise<void>;

  /** Retrieve audit entries for a file */
  getByFile(filePath: string, limit?: number): Promise<ReadonlyArray<TransformAuditEntry>>;

  /** Retrieve a specific entry by ID */
  getById(id: string): Promise<TransformAuditEntry | null>;

  /** Search audit entries by instruction text (semantic search via HNSW) */
  search(query: string, limit?: number): Promise<ReadonlyArray<TransformAuditEntry>>;

  /** Get entries that triggered fallback (for pattern learning) */
  getFallbackEntries(limit?: number): Promise<ReadonlyArray<TransformAuditEntry>>;

  /** Prune entries older than the given timestamp */
  prune(olderThan: number): Promise<number>;
}
```

### 8.3 Integration with RuVector Intelligence

Audit entries feed into the RETRIEVE-JUDGE-DISTILL-CONSOLIDATE pipeline:

1. **RETRIEVE**: When a new transform is requested, search the audit store for similar past transforms using HNSW semantic search on the instruction text.
2. **JUDGE**: Evaluate whether past similar transforms succeeded or failed, and whether they required fallback.
3. **DISTILL**: If a pattern emerges (e.g., "wrap-in-try-catch always fails on single-return functions in Go"), extract it as a learned rule.
4. **CONSOLIDATE**: Store the rule so future transforms can skip the AST attempt and go directly to LLM for known-problematic patterns.

## 9. Complete Flow Diagram

```
User/Agent requests transform
  |
  v
TransformTransaction.begin(mode, instructions, originalSource)
  |
  v
ErrorTolerantParse(source, language)
  |-- success (full AST) -> proceed
  |-- partial (ERROR nodes) -> mark frozen regions, proceed with valid parts
  |-- total failure -> FallbackCascade(Tier 2, "source unparseable")
  |
  v
FOR each instruction:
  |
  AuditStore.search(instruction) -> check for known-bad patterns
  |-- known to always fail -> skip AST, go to FallbackCascade
  |
  ApplyTransform(instruction, AST)
  |-- success -> InstructionResult(applied)
  |-- partial success -> PartialTransformResult(N/M applied)
  |     |-- mode == all-or-nothing -> ROLLBACK, FallbackCascade
  |     |-- mode == best-effort -> continue, record partial
  |-- failure -> InstructionResult(failed, error)
  |     |-- mode == all-or-nothing -> ROLLBACK, FallbackCascade
  |     |-- mode == best-effort -> continue
  |
  v
PrintAST(modified AST) -> transformedSource
  |-- success -> proceed to validation
  |-- failure -> ROLLBACK, FallbackCascade(Tier 2, "print failed")
  |
  v
ValidationPipeline.run(originalSource, transformedSource)
  |-- all stages pass -> COMMIT
  |-- required stage fails -> ROLLBACK, FallbackCascade
  |-- optional stage warns -> COMMIT with warnings
  |
  v
AuditStore.record(entry)
  |
  v
Return TransactionOutcome to caller
```

## 10. Configuration

```typescript
/**
 * Top-level configuration for Agent Booster error handling.
 */
export interface ErrorHandlingConfig {
  /** Default transaction mode for batch transforms */
  readonly defaultTransactionMode: TransactionMode;

  /** Maximum time for a single transform instruction (ms) */
  readonly instructionTimeoutMs: number;

  /** Maximum time for the entire transaction (ms) */
  readonly transactionTimeoutMs: number;

  /** Maximum source file size in bytes */
  readonly maxFileSizeBytes: number;

  /** Maximum number of instructions per transaction */
  readonly maxInstructionsPerTransaction: number;

  /** Whether to attempt fuzzy-match suggestions on target-not-found */
  readonly enableFuzzyMatchSuggestions: boolean;

  /** Maximum edit distance for fuzzy-match suggestions */
  readonly fuzzyMatchThreshold: number;

  /** Validation pipeline config */
  readonly validation: ValidationPipelineConfig;

  /** Whether to use the audit store for pattern learning */
  readonly enableAuditLearning: boolean;

  /** How many audit entries to retain per file */
  readonly auditRetentionPerFile: number;

  /** Fallback cascade config */
  readonly fallback: {
    /** Whether to enable automatic fallback to LLM */
    readonly enabled: boolean;
    /** Default LLM tier for fallback */
    readonly defaultTier: 2 | 3;
    /** Pass partial results to LLM (if any) */
    readonly passPartialResults: boolean;
    /** Maximum cost allowed for LLM fallback */
    readonly maxFallbackCostUsd: number;
  };
}

/**
 * Sensible defaults.
 */
export const DEFAULT_ERROR_HANDLING_CONFIG: ErrorHandlingConfig = {
  defaultTransactionMode: 'best-effort',
  instructionTimeoutMs: 5000,
  transactionTimeoutMs: 30000,
  maxFileSizeBytes: 10 * 1024 * 1024,  // 10 MB
  maxInstructionsPerTransaction: 50,
  enableFuzzyMatchSuggestions: true,
  fuzzyMatchThreshold: 3,  // Levenshtein distance
  validation: {
    stages: [],  // Populated at runtime by provider
    timeoutMs: 10000,
    skipValidation: false,
  },
  enableAuditLearning: true,
  auditRetentionPerFile: 100,
  fallback: {
    enabled: true,
    defaultTier: 2,
    passPartialResults: true,
    maxFallbackCostUsd: 0.05,
  },
};
```

## Consequences

### Positive

1. **Graceful degradation**: Transforms never silently corrupt source code; they either succeed, partially succeed with clear reporting, or roll back cleanly.
2. **Actionable errors**: Users and downstream agents get specific, suggestion-rich error messages instead of generic failures.
3. **Learning from failures**: The audit trail feeds into RuVector intelligence so the system improves over time, skipping AST attempts for known-bad patterns.
4. **Preserved fallback path**: The existing ADR-026 cascade (AST -> Haiku -> Sonnet/Opus) is preserved and enhanced with context from the AST failure.
5. **Broken-code tolerance**: Error-tolerant parsing means the system can still transform valid parts of files with syntax errors.

### Negative

1. **Increased complexity**: Transaction semantics, partial results, and the validation pipeline add implementation surface area.
2. **Memory overhead**: Keeping the original source in memory during transactions uses additional memory (mitigated by the 10MB file size limit).
3. **Audit storage growth**: Audit entries accumulate; requires pruning strategy.

### Neutral

1. **Configuration surface**: The `ErrorHandlingConfig` has many knobs; defaults are sensible for most use cases.
2. **Validation stage cost**: Optional stages (type-check, go-vet) add latency but can be disabled for batch operations.

## References

- ADR-026: Agent Booster AST-Based Dynamic Model Routing
- ADR-017: RuVector Integration Architecture
- Task #4: Language Provider Plugin Interface (defines `TransformInstruction`)
- Task #6: AST Transform Instruction DSL
- Task #7: WASM Runtime Architecture
- Task #8: Comment/Whitespace/Formatting Preservation
- Task #10: Current Agent Booster Migration Analysis

## File Placement

This design will be implemented in:

```
v3/@claude-flow/cli/src/agent-booster/
  errors/
    taxonomy.ts          -- TransformError, ErrorSeverity, error codes
    formatter.ts         -- ErrorFormatter implementation
  transaction/
    transaction.ts       -- TransformTransaction, commit/rollback
    partial-result.ts    -- PartialTransformResult, MatchResult
  validation/
    pipeline.ts          -- ValidationPipeline, ValidationStage
    stages/
      syntax-reparse.ts  -- Re-parse validation stage
      diff-sanity.ts     -- Diff bounds check
      comment-check.ts   -- Comment preservation check
      type-check.ts      -- TypeScript type check (optional)
  fallback/
    cascade.ts           -- FallbackContext, FallbackDecision, routing
    prompt-builder.ts    -- Constructs LLM prompts from AST failure context
  audit/
    audit-store.ts       -- AuditStore interface + AgentDB implementation
    audit-entry.ts       -- TransformAuditEntry type
  config.ts              -- ErrorHandlingConfig, defaults
```
