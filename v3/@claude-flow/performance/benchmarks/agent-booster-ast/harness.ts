/**
 * Agent Booster AST Performance Benchmark — Harness
 *
 * Orchestrates the full benchmark lifecycle:
 *   1. Load test corpus
 *   2. Run N warmup + M measured iterations per (file, transform) pair
 *   3. Collect timing, memory, and formatting metrics
 *   4. Compute statistical summaries (p50, p95, p99)
 *   5. Compare against performance budgets
 *   6. Detect regressions against stored baseline
 *   7. Export JSON and Markdown reports
 *
 * Integrates with the existing V3 BenchmarkRunner from
 * @claude-flow/performance/src/framework/benchmark.ts
 */

import { performance } from 'perf_hooks';
import os from 'node:os';

import type {
  IASTBenchmarkHarness,
  TestCorpus,
  TestCorpusFile,
  TransformSpec,
  TransformResult,
  BenchmarkHarnessConfig,
  BenchmarkSuiteOutput,
  ASTBenchmarkResult,
  ASTBenchmarkIteration,
  ASTTimingMetrics,
  ASTMemoryMetrics,
  FormattingMetrics,
  StatisticalSummary,
  BudgetStatus,
  BudgetViolation,
  PerformanceBudget,
  EnvironmentInfo,
  StoredBaseline,
  RegressionReport,
  SuiteSummary,
  CIBenchmarkReport,
  ComparativeAnalysis,
  SupportedLanguage,
  FileSize,
  TransformKind,
  DEFAULT_HARNESS_CONFIG,
  DEFAULT_PERFORMANCE_BUDGET,
  REGRESSION_THRESHOLD,
} from './types.js';
import { buildTestCorpus, getStandardTransforms } from './corpus.js';

// ============================================================================
// Statistical Helpers
// ============================================================================

function calcMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function calcMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function calcPercentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

function calcStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = calcMean(values);
  const sq = values.map((v) => (v - mean) ** 2);
  return Math.sqrt(calcMean(sq));
}

function summarize(values: number[]): StatisticalSummary {
  const mean = calcMean(values);
  const stdDev = calcStdDev(values);
  return {
    count: values.length,
    mean,
    median: calcMedian(values),
    p50: calcPercentile(values, 50),
    p95: calcPercentile(values, 95),
    p99: calcPercentile(values, 99),
    min: values.length > 0 ? Math.min(...values) : 0,
    max: values.length > 0 ? Math.max(...values) : 0,
    stdDev,
    cv: mean > 0 ? stdDev / mean : 0,
  };
}

function forceGC(): void {
  if (typeof global.gc === 'function') {
    global.gc();
  }
}

// ============================================================================
// Formatting Comparison
// ============================================================================

/**
 * Compare original and transformed source to measure formatting preservation.
 * Only checks lines that the transform did NOT intend to modify.
 */
function measureFormatting(
  original: string,
  transformed: string,
  nodesModified: number
): FormattingMetrics {
  const origLines = original.split('\n');
  const transLines = transformed.split('\n');

  // Approximate: lines that match exactly are "preserved"
  let preservedCount = 0;
  const minLen = Math.min(origLines.length, transLines.length);

  for (let i = 0; i < minLen; i++) {
    if (origLines[i] === transLines[i]) {
      preservedCount++;
    }
  }

  // Unchanged lines = total - estimated changed (use nodesModified as proxy)
  // A more accurate version would use AST diff, but for benchmarking this is sufficient
  const estimatedChanged = Math.min(nodesModified * 2, origLines.length);
  const unchangedLines = origLines.length - estimatedChanged;

  const accuracy =
    unchangedLines > 0
      ? Math.min(1, preservedCount / Math.max(1, unchangedLines))
      : 1;

  // Check whitespace: does transformed preserve leading whitespace pattern?
  const whitespacePreserved = transLines.every((line, i) => {
    if (i >= origLines.length) return true;
    const origIndent = origLines[i]!.match(/^(\s*)/)?.[1] ?? '';
    const transIndent = line.match(/^(\s*)/)?.[1] ?? '';
    // If line content changed, indent may change legitimately
    if (origLines[i] !== line) return true;
    return origIndent === transIndent;
  });

  // Check comments: are all comment lines from original present in transformed?
  const commentPatterns = [/^\s*\/\//, /^\s*\/\*/, /^\s*\*/, /^\s*#/, /^\s*--/];
  const origComments = origLines.filter((l) =>
    commentPatterns.some((p) => p.test(l))
  );
  const transComments = transLines.filter((l) =>
    commentPatterns.some((p) => p.test(l))
  );
  const commentsPreserved = origComments.length <= transComments.length;

  return {
    totalLines: origLines.length,
    unchangedLines,
    preservedLines: preservedCount,
    preservationAccuracy: accuracy,
    whitespacePreserved,
    commentsPreserved,
  };
}

// ============================================================================
// Environment Detection
// ============================================================================

function getEnvironment(): EnvironmentInfo {
  const cpus = os.cpus();
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model ?? 'unknown',
    totalMemoryBytes: os.totalmem(),
    wasmSupport: typeof WebAssembly !== 'undefined',
  };
}

// ============================================================================
// Budget Checker
// ============================================================================

function checkBudget(
  result: { timing: { roundTrip: StatisticalSummary }; memory: { peakHeap: StatisticalSummary }; formatting: { accuracy: number } },
  fileSize: FileSize,
  budget: PerformanceBudget
): BudgetStatus {
  const violations: BudgetViolation[] = [];

  // Round-trip time budget by file size
  const timingBudgets: Record<FileSize, number> = {
    small: budget.smallFileRoundTripMs,
    medium: budget.mediumFileRoundTripMs,
    large: budget.largeFileRoundTripMs,
    xl: budget.xlFileRoundTripMs,
  };

  const timingBudget = timingBudgets[fileSize];
  const p95RoundTrip = result.timing.roundTrip.p95;

  if (p95RoundTrip > timingBudget) {
    const ratio = p95RoundTrip / timingBudget;
    violations.push({
      metric: `roundTrip_p95_${fileSize}`,
      budget: timingBudget,
      actual: p95RoundTrip,
      ratio,
      isRegression: ratio > REGRESSION_THRESHOLD,
    });
  }

  // Memory budget
  const peakHeap = result.memory.peakHeap.max;
  if (peakHeap > budget.memoryPerModuleBytes) {
    const ratio = peakHeap / budget.memoryPerModuleBytes;
    violations.push({
      metric: 'peakHeapBytes',
      budget: budget.memoryPerModuleBytes,
      actual: peakHeap,
      ratio,
      isRegression: ratio > REGRESSION_THRESHOLD,
    });
  }

  // Formatting accuracy budget
  if (result.formatting.accuracy < budget.minFormattingAccuracy) {
    violations.push({
      metric: 'formattingAccuracy',
      budget: budget.minFormattingAccuracy,
      actual: result.formatting.accuracy,
      ratio: budget.minFormattingAccuracy / Math.max(0.01, result.formatting.accuracy),
      isRegression: true,
    });
  }

  return {
    met: violations.length === 0,
    violations,
  };
}

// ============================================================================
// Harness Implementation
// ============================================================================

/**
 * Placeholder transform executor.
 * In production, this delegates to the actual WASM-based AST engine.
 * During benchmark design, it simulates the expected pipeline.
 */
async function executeTransform(
  file: TestCorpusFile,
  transform: TransformSpec
): Promise<{ timing: ASTTimingMetrics; memory: ASTMemoryMetrics; result: TransformResult }> {
  const memBefore = process.memoryUsage().heapUsed;

  // Phase 1: Parse
  const parseStart = performance.now();
  // Simulated parse: actual implementation will call WASM parser
  const _ast = { source: file.content, language: file.language };
  const parseEnd = performance.now();

  // Phase 2: Transform
  const transformStart = performance.now();
  // Simulated transform: actual implementation will traverse/modify AST
  let output = file.content;
  let nodesVisited = 0;
  let nodesModified = 0;

  switch (transform.kind) {
    case 'rename-function': {
      // Simple: find first function name and rename it
      const patterns: Record<SupportedLanguage, RegExp> = {
        go: /func\s+(\w+)\s*\(/,
        rust: /fn\s+(\w+)\s*[\(<]/,
        typescript: /function\s+(\w+)\s*[\(<]/,
      };
      const match = file.content.match(patterns[file.language]);
      if (match?.[1]) {
        const suffix = (transform.params.newNameSuffix as string) ?? 'Renamed';
        output = file.content.replace(
          new RegExp(`\\b${match[1]}\\b`, 'g'),
          `${match[1]}${suffix}`
        );
        nodesVisited = file.content.split('\n').length;
        nodesModified = (output.match(new RegExp(`${match[1]}${suffix}`, 'g')) || []).length;
      }
      break;
    }
    default:
      // Other transforms: placeholder counts
      nodesVisited = Math.floor(file.lineCount * 0.8);
      nodesModified = Math.floor(file.lineCount * 0.1);
      break;
  }
  const transformEnd = performance.now();

  // Phase 3: Print
  const printStart = performance.now();
  // Simulated print: actual implementation will serialize AST back to source
  const _printed = output;
  const printEnd = performance.now();

  const peakHeap = process.memoryUsage().heapUsed;

  return {
    timing: {
      parseTimeMs: parseEnd - parseStart,
      transformTimeMs: transformEnd - transformStart,
      printTimeMs: printEnd - printStart,
      roundTripTimeMs: printEnd - parseStart,
    },
    memory: {
      peakHeapBytes: peakHeap,
      heapDeltaBytes: peakHeap - memBefore,
      wasmMemoryBytes: 0, // Will be populated when WASM engine is integrated
    },
    result: {
      success: true,
      output,
      nodesVisited,
      nodesModified,
    },
  };
}

// ============================================================================
// Main Harness Class
// ============================================================================

export class ASTBenchmarkHarness implements IASTBenchmarkHarness {
  private budget: PerformanceBudget;

  constructor(budget: PerformanceBudget = DEFAULT_PERFORMANCE_BUDGET) {
    this.budget = budget;
  }

  async loadCorpus(): Promise<TestCorpus> {
    return buildTestCorpus();
  }

  async runBenchmark(
    file: TestCorpusFile,
    transform: TransformSpec,
    config: BenchmarkHarnessConfig
  ): Promise<ASTBenchmarkResult> {
    const iterations: ASTBenchmarkIteration[] = [];

    // Warmup
    for (let i = 0; i < config.warmupIterations; i++) {
      await executeTransform(file, transform);
    }

    // Measured iterations
    for (let i = 0; i < config.measuredIterations; i++) {
      if (config.forceGC) forceGC();

      const { timing, memory, result } = await executeTransform(file, transform);

      const formatting = config.verifyFormatting
        ? measureFormatting(file.content, result.output ?? file.content, result.nodesModified)
        : {
            totalLines: file.lineCount,
            unchangedLines: file.lineCount,
            preservedLines: file.lineCount,
            preservationAccuracy: 1,
            whitespacePreserved: true,
            commentsPreserved: true,
          };

      iterations.push({
        iterationIndex: i,
        timing,
        memory,
        formatting,
        transform: result,
      });
    }

    // Compute statistics
    const parseTimes = iterations.map((it) => it.timing.parseTimeMs);
    const transformTimes = iterations.map((it) => it.timing.transformTimeMs);
    const printTimes = iterations.map((it) => it.timing.printTimeMs);
    const roundTripTimes = iterations.map((it) => it.timing.roundTripTimeMs);
    const peakHeaps = iterations.map((it) => it.memory.peakHeapBytes);
    const heapDeltas = iterations.map((it) => it.memory.heapDeltaBytes);

    const avgAccuracy = calcMean(iterations.map((it) => it.formatting.preservationAccuracy));
    const allWhitespace = iterations.every((it) => it.formatting.whitespacePreserved);
    const allComments = iterations.every((it) => it.formatting.commentsPreserved);

    const timingSummary = {
      parse: summarize(parseTimes),
      transform: summarize(transformTimes),
      print: summarize(printTimes),
      roundTrip: summarize(roundTripTimes),
    };

    const memorySummary = {
      peakHeap: summarize(peakHeaps),
      heapDelta: summarize(heapDeltas),
    };

    const formattingSummary = {
      accuracy: avgAccuracy,
      whitespacePreserved: allWhitespace,
      commentsPreserved: allComments,
    };

    const budgetStatus = checkBudget(
      { timing: timingSummary, memory: memorySummary, formatting: formattingSummary },
      file.size,
      this.budget
    );

    const resultId = `${file.language}-${file.size}-${transform.kind}`;

    return {
      id: resultId,
      language: file.language,
      fileSize: file.size,
      transform: transform.kind,
      corpusFileId: file.id,
      timing: timingSummary,
      memory: memorySummary,
      formatting: formattingSummary,
      budgetStatus,
      iterations: config.collectMemorySnapshots ? iterations : undefined,
      timestamp: Date.now(),
    };
  }

  async runSuite(
    configOverrides: Partial<BenchmarkHarnessConfig> = {}
  ): Promise<BenchmarkSuiteOutput> {
    const config: BenchmarkHarnessConfig = {
      ...DEFAULT_HARNESS_CONFIG,
      ...configOverrides,
    };

    const suiteStart = performance.now();
    const corpus = await this.loadCorpus();
    const transforms = getStandardTransforms();
    const results: ASTBenchmarkResult[] = [];

    for (const lang of config.languages) {
      for (const size of config.fileSizes) {
        const files = corpus.getFiles({ language: lang, size });
        if (files.length === 0) continue;
        const file = files[0]!;

        for (const transformKind of config.transforms) {
          const transform = transforms[transformKind];
          if (!transform) continue;

          console.log(`  Benchmarking: ${lang}/${size}/${transformKind}`);
          const result = await this.runBenchmark(file, transform, config);
          results.push(result);
        }
      }
    }

    const suiteDuration = performance.now() - suiteStart;

    const overallBudgetMet = results.every((r) => r.budgetStatus.met);

    return {
      metadata: {
        name: 'Agent Booster AST Benchmark Suite',
        version: '1.0.0',
        timestamp: Date.now(),
        duration: suiteDuration,
        config,
        budget: this.budget,
        environment: getEnvironment(),
      },
      results,
      comparisons: [], // Populated by compareWithBaseline
      overallBudgetMet,
      regressions: [],
      summary: this.computeSummary(results),
    };
  }

  compareWithBaseline(
    results: ASTBenchmarkResult[],
    baseline: StoredBaseline
  ): RegressionReport[] {
    const regressions: RegressionReport[] = [];

    for (const result of results) {
      const baseResult = baseline.results.find((b) => b.id === result.id);
      if (!baseResult) continue;

      // Check round-trip time regression
      const prevRT = baseResult.timing.roundTrip.p95;
      const currRT = result.timing.roundTrip.p95;
      const changePercent = ((currRT - prevRT) / prevRT) * 100;

      if (currRT > prevRT * REGRESSION_THRESHOLD) {
        const timingBudgets: Record<FileSize, number> = {
          small: this.budget.smallFileRoundTripMs,
          medium: this.budget.mediumFileRoundTripMs,
          large: this.budget.largeFileRoundTripMs,
          xl: this.budget.xlFileRoundTripMs,
        };

        regressions.push({
          resultId: result.id,
          metric: 'roundTrip_p95',
          previousValue: prevRT,
          currentValue: currRT,
          changePercent,
          budgetValue: timingBudgets[result.fileSize],
          severity: changePercent > 50 ? 'critical' : 'warning',
        });
      }

      // Check memory regression
      const prevMem = baseResult.memory.peakHeap.max;
      const currMem = result.memory.peakHeap.max;
      if (currMem > prevMem * REGRESSION_THRESHOLD) {
        regressions.push({
          resultId: result.id,
          metric: 'peakHeap',
          previousValue: prevMem,
          currentValue: currMem,
          changePercent: ((currMem - prevMem) / prevMem) * 100,
          budgetValue: this.budget.memoryPerModuleBytes,
          severity: currMem > this.budget.memoryPerModuleBytes ? 'critical' : 'warning',
        });
      }

      // Check formatting accuracy regression
      const prevAcc = baseResult.formatting.accuracy;
      const currAcc = result.formatting.accuracy;
      if (currAcc < prevAcc * (2 - REGRESSION_THRESHOLD)) {
        regressions.push({
          resultId: result.id,
          metric: 'formattingAccuracy',
          previousValue: prevAcc,
          currentValue: currAcc,
          changePercent: ((currAcc - prevAcc) / prevAcc) * 100,
          budgetValue: this.budget.minFormattingAccuracy,
          severity: currAcc < this.budget.minFormattingAccuracy ? 'critical' : 'warning',
        });
      }
    }

    return regressions;
  }

  generateMarkdownReport(output: BenchmarkSuiteOutput): string {
    const lines: string[] = [];
    const { metadata, results, summary, regressions } = output;

    lines.push('# Agent Booster AST Benchmark Report');
    lines.push('');
    lines.push(`**Date:** ${new Date(metadata.timestamp).toISOString()}`);
    lines.push(`**Duration:** ${(metadata.duration / 1000).toFixed(2)}s`);
    lines.push(`**Node:** ${metadata.environment.nodeVersion}`);
    lines.push(`**Platform:** ${metadata.environment.platform}/${metadata.environment.arch}`);
    lines.push(`**CPUs:** ${metadata.environment.cpuCount}x ${metadata.environment.cpuModel}`);
    lines.push('');

    // Overall status
    lines.push(`## Status: ${output.overallBudgetMet ? 'PASS' : 'FAIL'}`);
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total benchmarks | ${summary.totalBenchmarks} |`);
    lines.push(`| Passed | ${summary.passed} |`);
    lines.push(`| Failed | ${summary.failed} |`);
    lines.push(`| Regressions | ${summary.regressions} |`);
    lines.push('');

    // Round-trip by file size
    lines.push('## Round-Trip Time by File Size (p95, ms)');
    lines.push('');
    lines.push('| Size | Avg p95 | Budget |');
    lines.push('|------|---------|--------|');
    const sizeBudgets: Record<FileSize, number> = {
      small: metadata.budget.smallFileRoundTripMs,
      medium: metadata.budget.mediumFileRoundTripMs,
      large: metadata.budget.largeFileRoundTripMs,
      xl: metadata.budget.xlFileRoundTripMs,
    };
    for (const size of ['small', 'medium', 'large', 'xl'] as FileSize[]) {
      const avg = summary.avgRoundTripBySize[size];
      const budget = sizeBudgets[size];
      const status = avg <= budget ? 'PASS' : 'FAIL';
      lines.push(`| ${size} | ${avg.toFixed(3)} | ${budget} (${status}) |`);
    }
    lines.push('');

    // Detailed results table
    lines.push('## Detailed Results');
    lines.push('');
    lines.push('| Language | Size | Transform | p50 (ms) | p95 (ms) | p99 (ms) | Memory (MB) | Fmt Acc | Status |');
    lines.push('|----------|------|-----------|----------|----------|----------|-------------|---------|--------|');

    for (const r of results) {
      const memMB = (r.memory.peakHeap.max / (1024 * 1024)).toFixed(1);
      const fmtPct = (r.formatting.accuracy * 100).toFixed(1);
      const status = r.budgetStatus.met ? 'PASS' : 'FAIL';
      lines.push(
        `| ${r.language} | ${r.fileSize} | ${r.transform} | ${r.timing.roundTrip.p50.toFixed(3)} | ${r.timing.roundTrip.p95.toFixed(3)} | ${r.timing.roundTrip.p99.toFixed(3)} | ${memMB} | ${fmtPct}% | ${status} |`
      );
    }
    lines.push('');

    // Regressions
    if (regressions.length > 0) {
      lines.push('## Regressions');
      lines.push('');
      lines.push('| Benchmark | Metric | Previous | Current | Change | Severity |');
      lines.push('|-----------|--------|----------|---------|--------|----------|');
      for (const reg of regressions) {
        lines.push(
          `| ${reg.resultId} | ${reg.metric} | ${reg.previousValue.toFixed(3)} | ${reg.currentValue.toFixed(3)} | ${reg.changePercent >= 0 ? '+' : ''}${reg.changePercent.toFixed(1)}% | ${reg.severity} |`
        );
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  generateCIReport(
    output: BenchmarkSuiteOutput,
    baseline?: StoredBaseline
  ): CIBenchmarkReport {
    let regressions: RegressionReport[] = [];
    if (baseline) {
      regressions = this.compareWithBaseline(output.results, baseline);
    }

    const blockingRegressions = regressions.filter((r) => r.severity === 'critical');
    const warnings = regressions.filter((r) => r.severity === 'warning');
    const exitCode = blockingRegressions.length > 0 ? 1 : 0;

    return {
      exitCode: exitCode as 0 | 1,
      markdownSummary: this.generateMarkdownReport({
        ...output,
        regressions,
        summary: {
          ...output.summary,
          regressions: regressions.length,
        },
      }),
      jsonResultsPath: 'benchmark-results.json',
      baselinePath: 'benchmark-baseline.json',
      blockingRegressions,
      warnings,
    };
  }

  exportJSON(output: BenchmarkSuiteOutput): string {
    return JSON.stringify(output, null, 2);
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private computeSummary(results: ASTBenchmarkResult[]): SuiteSummary {
    const passed = results.filter((r) => r.budgetStatus.met).length;
    const failed = results.length - passed;

    // Average round-trip by size
    const avgBySize: Record<FileSize, number> = { small: 0, medium: 0, large: 0, xl: 0 };
    const countBySize: Record<FileSize, number> = { small: 0, medium: 0, large: 0, xl: 0 };
    for (const r of results) {
      avgBySize[r.fileSize] += r.timing.roundTrip.p95;
      countBySize[r.fileSize]++;
    }
    for (const size of Object.keys(avgBySize) as FileSize[]) {
      avgBySize[size] = countBySize[size] > 0 ? avgBySize[size] / countBySize[size] : 0;
    }

    // Average round-trip by language
    const avgByLang: Record<SupportedLanguage, number> = { go: 0, rust: 0, typescript: 0 };
    const countByLang: Record<SupportedLanguage, number> = { go: 0, rust: 0, typescript: 0 };
    for (const r of results) {
      avgByLang[r.language] += r.timing.roundTrip.p95;
      countByLang[r.language]++;
    }
    for (const lang of Object.keys(avgByLang) as SupportedLanguage[]) {
      avgByLang[lang] = countByLang[lang] > 0 ? avgByLang[lang] / countByLang[lang] : 0;
    }

    // Average round-trip by transform
    const transforms: TransformKind[] = [
      'rename-function', 'change-visibility', 'add-type-annotations',
      'add-error-handling', 'extract-function',
    ];
    const avgByTransform: Record<TransformKind, number> = {} as Record<TransformKind, number>;
    const countByTransform: Record<TransformKind, number> = {} as Record<TransformKind, number>;
    for (const t of transforms) {
      avgByTransform[t] = 0;
      countByTransform[t] = 0;
    }
    for (const r of results) {
      avgByTransform[r.transform] += r.timing.roundTrip.p95;
      countByTransform[r.transform]++;
    }
    for (const t of transforms) {
      avgByTransform[t] = countByTransform[t] > 0 ? avgByTransform[t] / countByTransform[t] : 0;
    }

    return {
      totalBenchmarks: results.length,
      passed,
      failed,
      regressions: 0, // Set by caller after baseline comparison
      avgRoundTripBySize: avgBySize,
      avgRoundTripByLanguage: avgByLang,
      avgRoundTripByTransform: avgByTransform,
      geoMeanSpeedupVsTier2: 0, // Set when baseline comparisons are available
    };
  }
}

// ============================================================================
// Entry point for direct execution
// ============================================================================

export async function runAgentBoosterBenchmarks(
  config?: Partial<BenchmarkHarnessConfig>
): Promise<BenchmarkSuiteOutput> {
  console.log('=== Agent Booster AST Performance Benchmark Suite ===');
  console.log('');

  const harness = new ASTBenchmarkHarness();
  const output = await harness.runSuite(config);

  // Print report
  console.log(harness.generateMarkdownReport(output));

  return output;
}

if (typeof process !== 'undefined' && process.argv[1]?.endsWith('harness.ts')) {
  runAgentBoosterBenchmarks().catch(console.error);
}
