/**
 * Agent Booster AST Benchmark — CI Integration
 *
 * Designed for GitHub Actions integration:
 *   - Runs on every PR touching Agent Booster or AST engine files
 *   - Compares against baseline from main branch
 *   - Blocks merge if critical regressions detected
 *   - Posts results as PR comment
 *   - Stores baseline for future comparisons
 *
 * Usage:
 *   npx tsx benchmarks/agent-booster-ast/ci.ts [--baseline path] [--output path]
 *
 * GitHub Actions workflow configuration (ci-benchmark.yml):
 *
 *   name: Agent Booster Benchmarks
 *   on:
 *     pull_request:
 *       paths:
 *         - 'v3/@claude-flow/cli/src/agent-booster/**'
 *         - 'v3/@claude-flow/cli/src/ruvector/**'
 *         - 'v3/@claude-flow/performance/benchmarks/agent-booster-ast/**'
 *         - 'wasm/**'
 *
 *   jobs:
 *     benchmark:
 *       runs-on: ubuntu-latest
 *       steps:
 *         - uses: actions/checkout@v4
 *
 *         - uses: actions/setup-node@v4
 *           with:
 *             node-version: '20'
 *             cache: 'npm'
 *
 *         - run: npm ci
 *
 *         # Download baseline from main branch artifact
 *         - uses: dawidd6/action-download-artifact@v3
 *           with:
 *             name: benchmark-baseline
 *             branch: main
 *             path: ./benchmark-baseline
 *           continue-on-error: true  # First run has no baseline
 *
 *         # Run benchmarks
 *         - run: >
 *             npx tsx v3/@claude-flow/performance/benchmarks/agent-booster-ast/ci.ts
 *             --baseline ./benchmark-baseline/baseline.json
 *             --output ./benchmark-results
 *           env:
 *             NODE_OPTIONS: '--expose-gc'
 *
 *         # Upload results as artifact (becomes baseline for next run)
 *         - uses: actions/upload-artifact@v4
 *           if: github.ref == 'refs/heads/main'
 *           with:
 *             name: benchmark-baseline
 *             path: ./benchmark-results/baseline.json
 *             retention-days: 90
 *
 *         # Post results as PR comment
 *         - uses: marocchino/sticky-pull-request-comment@v2
 *           if: github.event_name == 'pull_request'
 *           with:
 *             header: benchmark-results
 *             path: ./benchmark-results/report.md
 *
 *         # Fail if regressions detected
 *         - run: |
 *             EXIT_CODE=$(cat ./benchmark-results/exit-code.txt)
 *             exit $EXIT_CODE
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { ASTBenchmarkHarness } from './harness.js';
import type {
  StoredBaseline,
  BenchmarkHarnessConfig,
  DEFAULT_HARNESS_CONFIG,
} from './types.js';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CIArgs {
  baselinePath: string | null;
  outputDir: string;
  quick: boolean; // Reduced iterations for faster CI
}

function parseArgs(): CIArgs {
  const args = process.argv.slice(2);
  let baselinePath: string | null = null;
  let outputDir = './benchmark-results';
  let quick = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--baseline':
        baselinePath = args[++i] ?? null;
        break;
      case '--output':
        outputDir = args[++i] ?? outputDir;
        break;
      case '--quick':
        quick = true;
        break;
    }
  }

  return { baselinePath, outputDir, quick };
}

// ============================================================================
// CI Runner
// ============================================================================

async function runCIBenchmarks(): Promise<void> {
  const cliArgs = parseArgs();

  console.log('=== Agent Booster AST Benchmark — CI Mode ===');
  console.log(`Baseline: ${cliArgs.baselinePath ?? '(none, first run)'}`);
  console.log(`Output:   ${cliArgs.outputDir}`);
  console.log(`Quick:    ${cliArgs.quick}`);
  console.log('');

  // Ensure output directory exists
  const outputDir = resolve(cliArgs.outputDir);
  mkdirSync(outputDir, { recursive: true });

  // Load baseline if available
  let baseline: StoredBaseline | undefined;
  if (cliArgs.baselinePath && existsSync(cliArgs.baselinePath)) {
    try {
      const raw = readFileSync(cliArgs.baselinePath, 'utf-8');
      baseline = JSON.parse(raw) as StoredBaseline;
      console.log(`Loaded baseline from ${cliArgs.baselinePath} (commit: ${baseline.commitSha})`);
    } catch (err) {
      console.warn(`Warning: Failed to load baseline: ${err}`);
    }
  }

  // Configure for CI: reduced iterations if --quick, full otherwise
  const ciConfig: Partial<BenchmarkHarnessConfig> = cliArgs.quick
    ? {
        warmupIterations: 2,
        measuredIterations: 10,
        collectMemorySnapshots: false,
        // In quick mode, skip XL files
        fileSizes: ['small', 'medium', 'large'],
      }
    : {
        warmupIterations: 5,
        measuredIterations: 50,
        collectMemorySnapshots: false, // Reduce output size for CI
      };

  // Run benchmarks
  const harness = new ASTBenchmarkHarness();
  const output = await harness.runSuite(ciConfig);

  // Generate CI report
  const ciReport = harness.generateCIReport(output, baseline);

  // Write outputs
  // 1. Full JSON results
  const jsonPath = join(outputDir, 'results.json');
  writeFileSync(jsonPath, harness.exportJSON(output), 'utf-8');
  console.log(`Wrote results: ${jsonPath}`);

  // 2. Baseline file (for artifact upload on main branch)
  const baselineOutput: StoredBaseline = {
    commitSha: process.env.GITHUB_SHA ?? 'local',
    timestamp: Date.now(),
    results: output.results,
    environment: output.metadata.environment,
  };
  const baselineOutPath = join(outputDir, 'baseline.json');
  writeFileSync(baselineOutPath, JSON.stringify(baselineOutput, null, 2), 'utf-8');
  console.log(`Wrote baseline: ${baselineOutPath}`);

  // 3. Markdown report (for PR comment)
  const reportPath = join(outputDir, 'report.md');
  writeFileSync(reportPath, ciReport.markdownSummary, 'utf-8');
  console.log(`Wrote report: ${reportPath}`);

  // 4. Exit code (for workflow step)
  const exitCodePath = join(outputDir, 'exit-code.txt');
  writeFileSync(exitCodePath, String(ciReport.exitCode), 'utf-8');
  console.log(`Wrote exit code: ${exitCodePath} (${ciReport.exitCode})`);

  // Print summary
  console.log('');
  console.log('=== Summary ===');
  console.log(`Total:       ${output.summary.totalBenchmarks}`);
  console.log(`Passed:      ${output.summary.passed}`);
  console.log(`Failed:      ${output.summary.failed}`);
  console.log(`Regressions: ${ciReport.blockingRegressions.length} critical, ${ciReport.warnings.length} warnings`);
  console.log(`Exit code:   ${ciReport.exitCode}`);

  if (ciReport.blockingRegressions.length > 0) {
    console.log('');
    console.log('BLOCKING REGRESSIONS:');
    for (const reg of ciReport.blockingRegressions) {
      console.log(`  ${reg.resultId}: ${reg.metric} ${reg.changePercent >= 0 ? '+' : ''}${reg.changePercent.toFixed(1)}% (${reg.previousValue.toFixed(3)} -> ${reg.currentValue.toFixed(3)})`);
    }
  }

  // Exit with appropriate code
  process.exit(ciReport.exitCode);
}

// ============================================================================
// Entry point
// ============================================================================

runCIBenchmarks().catch((err) => {
  console.error('Benchmark CI runner failed:', err);
  process.exit(1);
});
