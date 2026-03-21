/**
 * Agent Booster AST Performance Benchmark — Type Definitions
 *
 * Comprehensive type system for benchmarking AST-based code transforms
 * across multiple languages (Go, Rust, TypeScript) with WASM execution.
 *
 * Performance budgets (ADR-026 Tier 1):
 *   Small/Medium files: <10ms round-trip
 *   Large files:        <50ms round-trip
 *   WASM cold start:    <100ms (cached: <5ms)
 *   Memory per module:  <50MB
 *   Must be 10x+ faster than LLM Tier 2 (Haiku)
 */

// ============================================================================
// Supported Languages
// ============================================================================

export type SupportedLanguage = 'go' | 'rust' | 'typescript';

export type FileSize = 'small' | 'medium' | 'large' | 'xl';

// ============================================================================
// Test Corpus
// ============================================================================

/**
 * A single test file in the corpus, with known characteristics.
 */
export interface TestCorpusFile {
  /** Unique identifier, e.g. "go-medium-module" */
  id: string;
  language: SupportedLanguage;
  size: FileSize;
  /** Approximate line count */
  lineCount: number;
  /** Source code content (loaded lazily from fixtures) */
  content: string;
  /** Human-readable description */
  description: string;
  /** Structural characteristics for validation */
  characteristics: FileCharacteristics;
}

export interface FileCharacteristics {
  functionCount: number;
  typeCount: number;
  importCount: number;
  /** Maximum nesting depth */
  maxNestingDepth: number;
  hasGenerics: boolean;
  hasAsync: boolean;
  hasErrorHandling: boolean;
}

/**
 * The full test corpus: files grouped by language and size.
 */
export interface TestCorpus {
  files: TestCorpusFile[];
  /** Retrieve files matching a filter */
  getFiles(filter: CorpusFilter): TestCorpusFile[];
}

export interface CorpusFilter {
  language?: SupportedLanguage;
  size?: FileSize;
  minLineCount?: number;
  maxLineCount?: number;
}

// ============================================================================
// Transform Types
// ============================================================================

/**
 * Standard transform operations to benchmark.
 * Ordered roughly by complexity (simple -> complex).
 */
export type TransformKind =
  | 'rename-function'
  | 'change-visibility'
  | 'add-type-annotations'
  | 'add-error-handling'
  | 'extract-function';

/**
 * A transform to apply during benchmarking.
 */
export interface TransformSpec {
  kind: TransformKind;
  /** Human-readable description */
  description: string;
  /** Complexity tier: how much AST traversal/analysis is needed */
  complexity: 'simple' | 'moderate' | 'complex';
  /** Language-specific parameters (e.g. target function name) */
  params: Record<string, unknown>;
}

/**
 * Result of applying a transform.
 */
export interface TransformResult {
  success: boolean;
  /** Transformed source code (if success) */
  output?: string;
  /** Number of AST nodes visited */
  nodesVisited: number;
  /** Number of AST nodes modified */
  nodesModified: number;
  /** Error message (if failure) */
  error?: string;
}

// ============================================================================
// Benchmark Metrics
// ============================================================================

/**
 * Timing breakdown for a single AST transform operation.
 */
export interface ASTTimingMetrics {
  /** Source code -> AST (ms) */
  parseTimeMs: number;
  /** AST traversal + modification (ms) */
  transformTimeMs: number;
  /** AST -> source code (ms) */
  printTimeMs: number;
  /** Total end-to-end: parse + transform + print (ms) */
  roundTripTimeMs: number;
}

/**
 * Memory metrics for a single operation.
 */
export interface ASTMemoryMetrics {
  /** Peak heap usage during operation (bytes) */
  peakHeapBytes: number;
  /** Heap delta: after - before (bytes) */
  heapDeltaBytes: number;
  /** WASM linear memory used (bytes), if applicable */
  wasmMemoryBytes: number;
}

/**
 * WASM module loading metrics.
 */
export interface WASMLoadMetrics {
  /** First load of the WASM module (ms) */
  coldStartMs: number;
  /** Subsequent load from cache (ms) */
  warmStartMs: number;
  /** Module binary size on disk (bytes) */
  moduleSizeBytes: number;
}

/**
 * Formatting preservation accuracy.
 */
export interface FormattingMetrics {
  /** Total lines in original source */
  totalLines: number;
  /** Lines that were not supposed to change */
  unchangedLines: number;
  /** Lines that were correctly preserved (unchanged AND matching original) */
  preservedLines: number;
  /** Percentage of unchanged lines that match original: preservedLines / unchangedLines */
  preservationAccuracy: number;
  /** Whether trailing newline, indentation style, etc. are preserved */
  whitespacePreserved: boolean;
  /** Whether comments are preserved in their original positions */
  commentsPreserved: boolean;
}

/**
 * Complete metrics for a single benchmark iteration.
 */
export interface ASTBenchmarkIteration {
  iterationIndex: number;
  timing: ASTTimingMetrics;
  memory: ASTMemoryMetrics;
  formatting: FormattingMetrics;
  transform: TransformResult;
}

// ============================================================================
// Benchmark Configuration
// ============================================================================

/**
 * Configuration for the benchmark harness.
 */
export interface BenchmarkHarnessConfig {
  /** Number of warmup iterations (not measured) */
  warmupIterations: number;
  /** Number of measured iterations */
  measuredIterations: number;
  /** Timeout per iteration (ms) */
  iterationTimeoutMs: number;
  /** Whether to force GC between iterations */
  forceGC: boolean;
  /** Whether to collect per-iteration memory snapshots */
  collectMemorySnapshots: boolean;
  /** Whether to verify formatting preservation */
  verifyFormatting: boolean;
  /** Languages to benchmark */
  languages: SupportedLanguage[];
  /** File sizes to benchmark */
  fileSizes: FileSize[];
  /** Transforms to benchmark */
  transforms: TransformKind[];
}

export const DEFAULT_HARNESS_CONFIG: BenchmarkHarnessConfig = {
  warmupIterations: 5,
  measuredIterations: 50,
  iterationTimeoutMs: 30_000,
  forceGC: true,
  collectMemorySnapshots: true,
  verifyFormatting: true,
  languages: ['go', 'rust', 'typescript'],
  fileSizes: ['small', 'medium', 'large', 'xl'],
  transforms: [
    'rename-function',
    'change-visibility',
    'add-type-annotations',
    'add-error-handling',
    'extract-function',
  ],
};

// ============================================================================
// Performance Budgets
// ============================================================================

/**
 * Performance budget thresholds. If a metric exceeds its budget,
 * the benchmark is flagged as a regression.
 */
export interface PerformanceBudget {
  /** Max round-trip time for small files (<=50 lines) in ms */
  smallFileRoundTripMs: number;
  /** Max round-trip time for medium files (<=300 lines) in ms */
  mediumFileRoundTripMs: number;
  /** Max round-trip time for large files (<=1000 lines) in ms */
  largeFileRoundTripMs: number;
  /** Max round-trip time for XL files (<=5000 lines) in ms */
  xlFileRoundTripMs: number;
  /** Max WASM cold start time in ms */
  wasmColdStartMs: number;
  /** Max WASM warm start time in ms */
  wasmWarmStartMs: number;
  /** Max memory per language module in bytes */
  memoryPerModuleBytes: number;
  /** Minimum formatting preservation accuracy (0-1) */
  minFormattingAccuracy: number;
  /** Must be at least this factor faster than LLM Tier 2 */
  minSpeedupVsTier2: number;
}

export const DEFAULT_PERFORMANCE_BUDGET: PerformanceBudget = {
  smallFileRoundTripMs: 10,
  mediumFileRoundTripMs: 10,
  largeFileRoundTripMs: 50,
  xlFileRoundTripMs: 200,
  wasmColdStartMs: 100,
  wasmWarmStartMs: 5,
  memoryPerModuleBytes: 50 * 1024 * 1024, // 50 MB
  minFormattingAccuracy: 0.95,
  minSpeedupVsTier2: 10,
};

/**
 * Regression threshold: flag if metric exceeds budget by this factor.
 */
export const REGRESSION_THRESHOLD = 1.2; // 20%

// ============================================================================
// Statistical Results
// ============================================================================

/**
 * Statistical summary of a metric across N iterations.
 */
export interface StatisticalSummary {
  count: number;
  mean: number;
  median: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  stdDev: number;
  /** Coefficient of variation (stdDev / mean) */
  cv: number;
}

/**
 * Complete benchmark result for one (language, size, transform) combination.
 */
export interface ASTBenchmarkResult {
  /** Unique result ID */
  id: string;
  language: SupportedLanguage;
  fileSize: FileSize;
  transform: TransformKind;
  /** File used */
  corpusFileId: string;
  /** Statistical summary of timing metrics */
  timing: {
    parse: StatisticalSummary;
    transform: StatisticalSummary;
    print: StatisticalSummary;
    roundTrip: StatisticalSummary;
  };
  /** Statistical summary of memory metrics */
  memory: {
    peakHeap: StatisticalSummary;
    heapDelta: StatisticalSummary;
  };
  /** Formatting preservation (averaged across iterations) */
  formatting: {
    accuracy: number;
    whitespacePreserved: boolean;
    commentsPreserved: boolean;
  };
  /** WASM load metrics (measured once, not per-iteration) */
  wasmLoad?: WASMLoadMetrics;
  /** Whether this result meets the performance budget */
  budgetStatus: BudgetStatus;
  /** Raw per-iteration data (optional, for deep analysis) */
  iterations?: ASTBenchmarkIteration[];
  /** Timestamp when benchmark was run */
  timestamp: number;
}

export interface BudgetStatus {
  met: boolean;
  /** Which budget items were violated */
  violations: BudgetViolation[];
}

export interface BudgetViolation {
  metric: string;
  budget: number;
  actual: number;
  /** How much the budget was exceeded (actual / budget) */
  ratio: number;
  /** Whether this exceeds the regression threshold */
  isRegression: boolean;
}

// ============================================================================
// Comparison Baselines
// ============================================================================

/**
 * Baseline result from an alternative approach (regex, LLM, native tool).
 */
export interface BaselineResult {
  provider: BaselineProvider;
  language: SupportedLanguage;
  fileSize: FileSize;
  transform: TransformKind;
  /** Time to complete the transform (ms) */
  latencyMs: number;
  /** Whether the transform was correct */
  correct: boolean;
  /** Formatting preservation accuracy (0-1) */
  formattingAccuracy: number;
  /** Cost in USD (0 for local tools) */
  costUsd: number;
}

export type BaselineProvider =
  | 'regex-agent-booster'   // Current regex-based Agent Booster
  | 'llm-haiku'             // LLM Tier 2
  | 'llm-opus'              // LLM Tier 3
  | 'native-gopls'          // Go language server
  | 'native-rust-analyzer'  // Rust language server
  | 'native-ts-morph';      // TypeScript ts-morph

/**
 * Comparative analysis between AST approach and baselines.
 */
export interface ComparativeAnalysis {
  astResult: ASTBenchmarkResult;
  baselines: BaselineResult[];
  speedups: SpeedupComparison[];
  /** Overall recommendation */
  recommendation: string;
}

export interface SpeedupComparison {
  baseline: BaselineProvider;
  /** AST latency / baseline latency (>1 means AST is slower) */
  latencyRatio: number;
  /** Displayed as "Nx faster" or "Nx slower" */
  speedupLabel: string;
  /** Whether AST approach is more accurate */
  moreAccurate: boolean;
}

// ============================================================================
// Suite Output
// ============================================================================

/**
 * Complete output of a benchmark suite run.
 */
export interface BenchmarkSuiteOutput {
  /** Suite metadata */
  metadata: {
    name: string;
    version: string;
    timestamp: number;
    duration: number;
    config: BenchmarkHarnessConfig;
    budget: PerformanceBudget;
    environment: EnvironmentInfo;
  };
  /** All individual benchmark results */
  results: ASTBenchmarkResult[];
  /** Comparative analysis against baselines */
  comparisons: ComparativeAnalysis[];
  /** Aggregate budget status */
  overallBudgetMet: boolean;
  /** Regressions detected vs previous run */
  regressions: RegressionReport[];
  /** Summary statistics */
  summary: SuiteSummary;
}

export interface EnvironmentInfo {
  nodeVersion: string;
  platform: string;
  arch: string;
  cpuCount: number;
  cpuModel: string;
  totalMemoryBytes: number;
  wasmSupport: boolean;
}

export interface RegressionReport {
  resultId: string;
  metric: string;
  previousValue: number;
  currentValue: number;
  changePercent: number;
  budgetValue: number;
  severity: 'warning' | 'critical';
}

export interface SuiteSummary {
  totalBenchmarks: number;
  passed: number;
  failed: number;
  regressions: number;
  /** Average round-trip by file size */
  avgRoundTripBySize: Record<FileSize, number>;
  /** Average round-trip by language */
  avgRoundTripByLanguage: Record<SupportedLanguage, number>;
  /** Average round-trip by transform */
  avgRoundTripByTransform: Record<TransformKind, number>;
  /** Speedup vs LLM Tier 2 (geometric mean) */
  geoMeanSpeedupVsTier2: number;
}

// ============================================================================
// CI Integration
// ============================================================================

/**
 * CI benchmark report, suitable for GitHub Actions annotations.
 */
export interface CIBenchmarkReport {
  /** Exit code: 0 if all budgets met, 1 if regressions */
  exitCode: 0 | 1;
  /** Human-readable summary for PR comment */
  markdownSummary: string;
  /** JSON results file path */
  jsonResultsPath: string;
  /** Baseline file path (from main branch) */
  baselinePath: string;
  /** Regressions that should block merge */
  blockingRegressions: RegressionReport[];
  /** Warnings that should be noted but not block */
  warnings: RegressionReport[];
}

/**
 * Stored baseline from the main branch, used for regression detection.
 */
export interface StoredBaseline {
  commitSha: string;
  timestamp: number;
  results: ASTBenchmarkResult[];
  environment: EnvironmentInfo;
}

// ============================================================================
// Harness Interface
// ============================================================================

/**
 * The benchmark harness: orchestrates loading corpus files,
 * running transforms, collecting metrics, and generating reports.
 */
export interface IASTBenchmarkHarness {
  /** Load or generate the test corpus */
  loadCorpus(): Promise<TestCorpus>;

  /** Run a single benchmark scenario */
  runBenchmark(
    file: TestCorpusFile,
    transform: TransformSpec,
    config: BenchmarkHarnessConfig
  ): Promise<ASTBenchmarkResult>;

  /** Run the full benchmark suite */
  runSuite(config?: Partial<BenchmarkHarnessConfig>): Promise<BenchmarkSuiteOutput>;

  /** Compare results against stored baseline */
  compareWithBaseline(
    results: ASTBenchmarkResult[],
    baseline: StoredBaseline
  ): RegressionReport[];

  /** Generate markdown report */
  generateMarkdownReport(output: BenchmarkSuiteOutput): string;

  /** Generate CI report */
  generateCIReport(
    output: BenchmarkSuiteOutput,
    baseline?: StoredBaseline
  ): CIBenchmarkReport;

  /** Export results as JSON */
  exportJSON(output: BenchmarkSuiteOutput): string;
}
