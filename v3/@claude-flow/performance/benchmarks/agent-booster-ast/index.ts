/**
 * Agent Booster AST Performance Benchmark Suite
 *
 * Entry point for the AST-based Agent Booster benchmark framework.
 *
 * @example
 *   // Run full suite
 *   import { runAgentBoosterBenchmarks } from './index.js';
 *   const output = await runAgentBoosterBenchmarks();
 *
 *   // Run with custom config
 *   const output = await runAgentBoosterBenchmarks({
 *     languages: ['typescript'],
 *     fileSizes: ['small', 'medium'],
 *     measuredIterations: 20,
 *   });
 *
 *   // Use harness directly
 *   import { ASTBenchmarkHarness } from './index.js';
 *   const harness = new ASTBenchmarkHarness();
 *   const corpus = await harness.loadCorpus();
 *   const result = await harness.runBenchmark(corpus.files[0], transform, config);
 */

export { ASTBenchmarkHarness, runAgentBoosterBenchmarks } from './harness.js';
export { buildTestCorpus, getStandardTransforms } from './corpus.js';
export type {
  // Core types
  SupportedLanguage,
  FileSize,
  TransformKind,
  TransformSpec,
  TransformResult,
  TestCorpus,
  TestCorpusFile,
  CorpusFilter,
  FileCharacteristics,

  // Metrics
  ASTTimingMetrics,
  ASTMemoryMetrics,
  WASMLoadMetrics,
  FormattingMetrics,
  ASTBenchmarkIteration,

  // Configuration
  BenchmarkHarnessConfig,
  PerformanceBudget,

  // Results
  StatisticalSummary,
  ASTBenchmarkResult,
  BudgetStatus,
  BudgetViolation,

  // Comparisons
  BaselineResult,
  BaselineProvider,
  ComparativeAnalysis,
  SpeedupComparison,

  // Suite output
  BenchmarkSuiteOutput,
  EnvironmentInfo,
  RegressionReport,
  SuiteSummary,

  // CI
  CIBenchmarkReport,
  StoredBaseline,

  // Harness interface
  IASTBenchmarkHarness,
} from './types.js';

export {
  DEFAULT_HARNESS_CONFIG,
  DEFAULT_PERFORMANCE_BUDGET,
  REGRESSION_THRESHOLD,
} from './types.js';
