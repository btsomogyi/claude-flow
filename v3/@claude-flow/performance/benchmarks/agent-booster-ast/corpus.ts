/**
 * Agent Booster AST Benchmark — Test Corpus Definitions
 *
 * Defines representative test files for each (language, size) pair.
 * Files are embedded as template strings so the benchmark suite is
 * self-contained and does not depend on external fixtures.
 *
 * Corpus matrix:
 *   Languages: Go, Rust, TypeScript
 *   Sizes:     Small (50), Medium (300), Large (1000), XL (5000)
 *   Total:     12 files
 */

import type {
  TestCorpus,
  TestCorpusFile,
  CorpusFilter,
  FileCharacteristics,
  SupportedLanguage,
  FileSize,
} from './types.js';

// ============================================================================
// Corpus Factory
// ============================================================================

/**
 * Build the test corpus with all language/size combinations.
 * Files are generated deterministically so benchmarks are reproducible.
 */
export function buildTestCorpus(): TestCorpus {
  const files: TestCorpusFile[] = [
    // --- Go ---
    buildGoSmall(),
    buildGoMedium(),
    buildGoLarge(),
    buildGoXL(),
    // --- Rust ---
    buildRustSmall(),
    buildRustMedium(),
    buildRustLarge(),
    buildRustXL(),
    // --- TypeScript ---
    buildTSSmall(),
    buildTSMedium(),
    buildTSLarge(),
    buildTSXL(),
  ];

  return {
    files,
    getFiles(filter: CorpusFilter): TestCorpusFile[] {
      return files.filter((f) => {
        if (filter.language && f.language !== filter.language) return false;
        if (filter.size && f.size !== filter.size) return false;
        if (filter.minLineCount && f.lineCount < filter.minLineCount) return false;
        if (filter.maxLineCount && f.lineCount > filter.maxLineCount) return false;
        return true;
      });
    },
  };
}

// ============================================================================
// File Size Targets
// ============================================================================

const SIZE_TARGETS: Record<FileSize, number> = {
  small: 50,
  medium: 300,
  large: 1000,
  xl: 5000,
};

// ============================================================================
// Go Files
// ============================================================================

function buildGoSmall(): TestCorpusFile {
  const content = `package calc

import "errors"

// Calculator performs basic arithmetic operations.
type Calculator struct {
\tprecision int
}

// New creates a Calculator with the given precision.
func New(precision int) *Calculator {
\treturn &Calculator{precision: precision}
}

// Add returns the sum of a and b.
func (c *Calculator) Add(a, b float64) float64 {
\treturn a + b
}

// Subtract returns the difference of a and b.
func (c *Calculator) Subtract(a, b float64) float64 {
\treturn a - b
}

// Multiply returns the product of a and b.
func (c *Calculator) Multiply(a, b float64) float64 {
\treturn a * b
}

// Divide returns a / b, or an error if b is zero.
func (c *Calculator) Divide(a, b float64) (float64, error) {
\tif b == 0 {
\t\treturn 0, errors.New("division by zero")
\t}
\treturn a / b, nil
}

// Precision returns the configured precision.
func (c *Calculator) Precision() int {
\treturn c.precision
}
`;

  return {
    id: 'go-small-calc',
    language: 'go',
    size: 'small',
    lineCount: content.split('\n').length,
    content,
    description: 'Simple calculator struct with basic arithmetic methods',
    characteristics: {
      functionCount: 6,
      typeCount: 1,
      importCount: 1,
      maxNestingDepth: 2,
      hasGenerics: false,
      hasAsync: false,
      hasErrorHandling: true,
    },
  };
}

function buildGoMedium(): TestCorpusFile {
  // Build a ~300-line Go file with multiple types, interfaces, methods
  const lines: string[] = [
    'package store',
    '',
    'import (',
    '\t"context"',
    '\t"errors"',
    '\t"fmt"',
    '\t"sync"',
    '\t"time"',
    ')',
    '',
    '// ErrNotFound is returned when a key does not exist.',
    'var ErrNotFound = errors.New("key not found")',
    '',
    '// ErrExpired is returned when a key has expired.',
    'var ErrExpired = errors.New("key expired")',
    '',
    '// Store defines the interface for a key-value store.',
    'type Store interface {',
    '\tGet(ctx context.Context, key string) ([]byte, error)',
    '\tSet(ctx context.Context, key string, value []byte, ttl time.Duration) error',
    '\tDelete(ctx context.Context, key string) error',
    '\tKeys(ctx context.Context, prefix string) ([]string, error)',
    '}',
    '',
    '// entry holds a value with optional expiration.',
    'type entry struct {',
    '\tvalue     []byte',
    '\texpiresAt time.Time',
    '\thasExpiry bool',
    '}',
    '',
    '// MemoryStore implements Store backed by an in-memory map.',
    'type MemoryStore struct {',
    '\tmu      sync.RWMutex',
    '\tentries map[string]*entry',
    '}',
    '',
    '// NewMemoryStore creates an empty MemoryStore.',
    'func NewMemoryStore() *MemoryStore {',
    '\treturn &MemoryStore{',
    '\t\tentries: make(map[string]*entry),',
    '\t}',
    '}',
    '',
  ];

  // Generate CRUD methods and helpers to reach ~300 lines
  const methods = [
    { name: 'Get', params: 'ctx context.Context, key string', returns: '([]byte, error)', body: [
      'ms.mu.RLock()',
      'defer ms.mu.RUnlock()',
      '',
      'e, ok := ms.entries[key]',
      'if !ok {',
      '\treturn nil, ErrNotFound',
      '}',
      '',
      'if e.hasExpiry && time.Now().After(e.expiresAt) {',
      '\treturn nil, ErrExpired',
      '}',
      '',
      'result := make([]byte, len(e.value))',
      'copy(result, e.value)',
      'return result, nil',
    ]},
    { name: 'Set', params: 'ctx context.Context, key string, value []byte, ttl time.Duration', returns: 'error', body: [
      'ms.mu.Lock()',
      'defer ms.mu.Unlock()',
      '',
      'e := &entry{',
      '\tvalue: make([]byte, len(value)),',
      '}',
      'copy(e.value, value)',
      '',
      'if ttl > 0 {',
      '\te.expiresAt = time.Now().Add(ttl)',
      '\te.hasExpiry = true',
      '}',
      '',
      'ms.entries[key] = e',
      'return nil',
    ]},
    { name: 'Delete', params: 'ctx context.Context, key string', returns: 'error', body: [
      'ms.mu.Lock()',
      'defer ms.mu.Unlock()',
      '',
      'if _, ok := ms.entries[key]; !ok {',
      '\treturn ErrNotFound',
      '}',
      '',
      'delete(ms.entries, key)',
      'return nil',
    ]},
    { name: 'Keys', params: 'ctx context.Context, prefix string', returns: '([]string, error)', body: [
      'ms.mu.RLock()',
      'defer ms.mu.RUnlock()',
      '',
      'var keys []string',
      'now := time.Now()',
      '',
      'for k, e := range ms.entries {',
      '\tif e.hasExpiry && now.After(e.expiresAt) {',
      '\t\tcontinue',
      '\t}',
      '\tif len(prefix) == 0 || len(k) >= len(prefix) && k[:len(prefix)] == prefix {',
      '\t\tkeys = append(keys, k)',
      '\t}',
      '}',
      '',
      'return keys, nil',
    ]},
    { name: 'Cleanup', params: '', returns: 'int', body: [
      'ms.mu.Lock()',
      'defer ms.mu.Unlock()',
      '',
      'now := time.Now()',
      'removed := 0',
      '',
      'for k, e := range ms.entries {',
      '\tif e.hasExpiry && now.After(e.expiresAt) {',
      '\t\tdelete(ms.entries, k)',
      '\t\tremoved++',
      '\t}',
      '}',
      '',
      'return removed',
    ]},
    { name: 'Len', params: '', returns: 'int', body: [
      'ms.mu.RLock()',
      'defer ms.mu.RUnlock()',
      'return len(ms.entries)',
    ]},
    { name: 'Clear', params: '', returns: '', body: [
      'ms.mu.Lock()',
      'defer ms.mu.Unlock()',
      'ms.entries = make(map[string]*entry)',
    ]},
  ];

  for (const m of methods) {
    lines.push(`// ${m.name} ${m.name === 'Get' ? 'retrieves a value by key.' : m.name === 'Set' ? 'stores a value with optional TTL.' : m.name === 'Delete' ? 'removes a key.' : m.name === 'Keys' ? 'returns keys matching prefix.' : m.name === 'Cleanup' ? 'removes expired entries.' : m.name === 'Len' ? 'returns the number of entries.' : 'removes all entries.'}`);
    lines.push(`func (ms *MemoryStore) ${m.name}(${m.params}) ${m.returns} {`);
    for (const bodyLine of m.body) {
      lines.push(bodyLine ? `\t${bodyLine}` : '');
    }
    lines.push('}');
    lines.push('');
  }

  // Add a Stats type and method
  lines.push(
    '// Stats holds store statistics.',
    'type Stats struct {',
    '\tTotalKeys   int',
    '\tExpiredKeys int',
    '\tActiveKeys  int',
    '}',
    '',
    '// Stats returns store statistics.',
    'func (ms *MemoryStore) Stats() Stats {',
    '\tms.mu.RLock()',
    '\tdefer ms.mu.RUnlock()',
    '',
    '\tnow := time.Now()',
    '\tvar expired, active int',
    '',
    '\tfor _, e := range ms.entries {',
    '\t\tif e.hasExpiry && now.After(e.expiresAt) {',
    '\t\t\texpired++',
    '\t\t} else {',
    '\t\t\tactive++',
    '\t\t}',
    '\t}',
    '',
    '\treturn Stats{',
    '\t\tTotalKeys:   len(ms.entries),',
    '\t\tExpiredKeys: expired,',
    '\t\tActiveKeys:  active,',
    '\t}',
    '}',
    '',
    '// String returns a human-readable representation of Stats.',
    'func (s Stats) String() string {',
    `\treturn fmt.Sprintf("total=%d expired=%d active=%d", s.TotalKeys, s.ExpiredKeys, s.ActiveKeys)`,
    '}',
    '',
  );

  // Pad to ~300 lines with additional helper functions
  while (lines.length < 290) {
    const idx = lines.length;
    lines.push(
      `// helper${idx} is an auto-generated helper for benchmarking.`,
      `func helper${idx}(input string) string {`,
      `\tif len(input) == 0 {`,
      `\t\treturn "empty"`,
      `\t}`,
      `\treturn fmt.Sprintf("processed:%s", input)`,
      `}`,
      '',
    );
  }

  const content = lines.join('\n');

  return {
    id: 'go-medium-store',
    language: 'go',
    size: 'medium',
    lineCount: content.split('\n').length,
    content,
    description: 'In-memory KV store with TTL, cleanup, stats, and helpers',
    characteristics: {
      functionCount: 12,
      typeCount: 4,
      importCount: 5,
      maxNestingDepth: 3,
      hasGenerics: false,
      hasAsync: false,
      hasErrorHandling: true,
    },
  };
}

function buildGoLarge(): TestCorpusFile {
  return generatePaddedFile('go', 'large', 1000);
}

function buildGoXL(): TestCorpusFile {
  return generatePaddedFile('go', 'xl', 5000);
}

// ============================================================================
// Rust Files
// ============================================================================

function buildRustSmall(): TestCorpusFile {
  const content = `use std::fmt;

/// A point in 2D space.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

impl Point {
    /// Creates a new Point.
    pub fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    /// Returns the distance to another point.
    pub fn distance_to(&self, other: &Point) -> f64 {
        let dx = self.x - other.x;
        let dy = self.y - other.y;
        (dx * dx + dy * dy).sqrt()
    }

    /// Returns a new point translated by (dx, dy).
    pub fn translate(&self, dx: f64, dy: f64) -> Self {
        Self {
            x: self.x + dx,
            y: self.y + dy,
        }
    }

    /// Returns the midpoint between self and other.
    pub fn midpoint(&self, other: &Point) -> Self {
        Self {
            x: (self.x + other.x) / 2.0,
            y: (self.y + other.y) / 2.0,
        }
    }
}

impl fmt::Display for Point {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "({}, {})", self.x, self.y)
    }
}
`;

  return {
    id: 'rust-small-point',
    language: 'rust',
    size: 'small',
    lineCount: content.split('\n').length,
    content,
    description: 'Simple Point struct with geometry methods',
    characteristics: {
      functionCount: 5,
      typeCount: 1,
      importCount: 1,
      maxNestingDepth: 2,
      hasGenerics: false,
      hasAsync: false,
      hasErrorHandling: false,
    },
  };
}

function buildRustMedium(): TestCorpusFile {
  const lines: string[] = [
    'use std::collections::HashMap;',
    'use std::sync::{Arc, RwLock};',
    'use std::time::{Duration, Instant};',
    '',
    '/// Error types for the cache.',
    '#[derive(Debug, thiserror::Error)]',
    'pub enum CacheError {',
    '    #[error("key not found: {0}")]',
    '    NotFound(String),',
    '    #[error("key expired: {0}")]',
    '    Expired(String),',
    '    #[error("lock poisoned")]',
    '    LockPoisoned,',
    '}',
    '',
    '/// A cached entry with optional TTL.',
    '#[derive(Debug, Clone)]',
    'struct Entry<V: Clone> {',
    '    value: V,',
    '    expires_at: Option<Instant>,',
    '}',
    '',
    '/// Thread-safe in-memory cache with TTL support.',
    '#[derive(Debug)]',
    'pub struct Cache<V: Clone + Send + Sync> {',
    '    data: Arc<RwLock<HashMap<String, Entry<V>>>>,',
    '    default_ttl: Option<Duration>,',
    '}',
    '',
    'impl<V: Clone + Send + Sync> Cache<V> {',
    '    /// Creates a new cache with no default TTL.',
    '    pub fn new() -> Self {',
    '        Self {',
    '            data: Arc::new(RwLock::new(HashMap::new())),',
    '            default_ttl: None,',
    '        }',
    '    }',
    '',
    '    /// Creates a new cache with a default TTL.',
    '    pub fn with_ttl(ttl: Duration) -> Self {',
    '        Self {',
    '            data: Arc::new(RwLock::new(HashMap::new())),',
    '            default_ttl: Some(ttl),',
    '        }',
    '    }',
    '',
    '    /// Gets a value by key.',
    '    pub fn get(&self, key: &str) -> Result<V, CacheError> {',
    '        let data = self.data.read().map_err(|_| CacheError::LockPoisoned)?;',
    '        match data.get(key) {',
    '            Some(entry) => {',
    '                if let Some(expires_at) = entry.expires_at {',
    '                    if Instant::now() > expires_at {',
    '                        return Err(CacheError::Expired(key.to_string()));',
    '                    }',
    '                }',
    '                Ok(entry.value.clone())',
    '            }',
    '            None => Err(CacheError::NotFound(key.to_string())),',
    '        }',
    '    }',
    '',
    '    /// Sets a value with optional TTL override.',
    '    pub fn set(&self, key: String, value: V, ttl: Option<Duration>) -> Result<(), CacheError> {',
    '        let mut data = self.data.write().map_err(|_| CacheError::LockPoisoned)?;',
    '        let effective_ttl = ttl.or(self.default_ttl);',
    '        let entry = Entry {',
    '            value,',
    '            expires_at: effective_ttl.map(|d| Instant::now() + d),',
    '        };',
    '        data.insert(key, entry);',
    '        Ok(())',
    '    }',
    '',
    '    /// Removes a key.',
    '    pub fn remove(&self, key: &str) -> Result<V, CacheError> {',
    '        let mut data = self.data.write().map_err(|_| CacheError::LockPoisoned)?;',
    '        match data.remove(key) {',
    '            Some(entry) => Ok(entry.value),',
    '            None => Err(CacheError::NotFound(key.to_string())),',
    '        }',
    '    }',
    '',
    '    /// Returns the number of entries (including expired).',
    '    pub fn len(&self) -> Result<usize, CacheError> {',
    '        let data = self.data.read().map_err(|_| CacheError::LockPoisoned)?;',
    '        Ok(data.len())',
    '    }',
    '',
    '    /// Checks if the cache is empty.',
    '    pub fn is_empty(&self) -> Result<bool, CacheError> {',
    '        Ok(self.len()? == 0)',
    '    }',
    '',
    '    /// Removes all expired entries.',
    '    pub fn cleanup(&self) -> Result<usize, CacheError> {',
    '        let mut data = self.data.write().map_err(|_| CacheError::LockPoisoned)?;',
    '        let now = Instant::now();',
    '        let before = data.len();',
    '        data.retain(|_, entry| {',
    '            entry.expires_at.map_or(true, |exp| now <= exp)',
    '        });',
    '        Ok(before - data.len())',
    '    }',
    '',
    '    /// Returns all non-expired keys.',
    '    pub fn keys(&self) -> Result<Vec<String>, CacheError> {',
    '        let data = self.data.read().map_err(|_| CacheError::LockPoisoned)?;',
    '        let now = Instant::now();',
    '        let keys: Vec<String> = data',
    '            .iter()',
    '            .filter(|(_, entry)| entry.expires_at.map_or(true, |exp| now <= exp))',
    '            .map(|(k, _)| k.clone())',
    '            .collect();',
    '        Ok(keys)',
    '    }',
    '}',
    '',
    'impl<V: Clone + Send + Sync> Default for Cache<V> {',
    '    fn default() -> Self {',
    '        Self::new()',
    '    }',
    '}',
    '',
  ];

  // Pad to ~300 lines with additional structs and impls
  while (lines.length < 290) {
    const idx = lines.length;
    lines.push(
      `/// Helper function ${idx} for benchmark corpus.`,
      `fn transform_value_${idx}(input: &str) -> String {`,
      `    if input.is_empty() {`,
      `        return String::from("empty");`,
      `    }`,
      `    format!("processed:{}", input)`,
      `}`,
      '',
    );
  }

  const content = lines.join('\n');

  return {
    id: 'rust-medium-cache',
    language: 'rust',
    size: 'medium',
    lineCount: content.split('\n').length,
    content,
    description: 'Thread-safe cache with generics, TTL, error handling',
    characteristics: {
      functionCount: 10,
      typeCount: 3,
      importCount: 3,
      maxNestingDepth: 4,
      hasGenerics: true,
      hasAsync: false,
      hasErrorHandling: true,
    },
  };
}

function buildRustLarge(): TestCorpusFile {
  return generatePaddedFile('rust', 'large', 1000);
}

function buildRustXL(): TestCorpusFile {
  return generatePaddedFile('rust', 'xl', 5000);
}

// ============================================================================
// TypeScript Files
// ============================================================================

function buildTSSmall(): TestCorpusFile {
  const content = `/**
 * A generic result type for operations that can fail.
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Configuration for the greeting service.
 */
export interface GreetingConfig {
  prefix: string;
  suffix: string;
  uppercase: boolean;
}

const DEFAULT_CONFIG: GreetingConfig = {
  prefix: 'Hello',
  suffix: '!',
  uppercase: false,
};

/**
 * Creates a greeting message.
 */
export function greet(name: string, config: Partial<GreetingConfig> = {}): string {
  const merged = { ...DEFAULT_CONFIG, ...config };
  let message = \`\${merged.prefix}, \${name}\${merged.suffix}\`;
  if (merged.uppercase) {
    message = message.toUpperCase();
  }
  return message;
}

/**
 * Validates a name string.
 */
export function validateName(name: unknown): Result<string> {
  if (typeof name !== 'string') {
    return { ok: false, error: new Error('Name must be a string') };
  }
  if (name.trim().length === 0) {
    return { ok: false, error: new Error('Name must not be empty') };
  }
  return { ok: true, value: name.trim() };
}

/**
 * Batch greet multiple names.
 */
export function batchGreet(names: string[], config?: Partial<GreetingConfig>): string[] {
  return names.map((name) => greet(name, config));
}
`;

  return {
    id: 'ts-small-greeting',
    language: 'typescript',
    size: 'small',
    lineCount: content.split('\n').length,
    content,
    description: 'Simple greeting module with types, validation, and batch',
    characteristics: {
      functionCount: 3,
      typeCount: 3,
      importCount: 0,
      maxNestingDepth: 2,
      hasGenerics: true,
      hasAsync: false,
      hasErrorHandling: true,
    },
  };
}

function buildTSMedium(): TestCorpusFile {
  const lines: string[] = [
    '/**',
    ' * Event-driven message bus with typed subscriptions.',
    ' */',
    '',
    'export interface EventMap {',
    '  [key: string]: unknown;',
    '}',
    '',
    'export type EventHandler<T> = (payload: T) => void | Promise<void>;',
    '',
    'interface Subscription {',
    '  id: string;',
    '  event: string;',
    '  handler: EventHandler<unknown>;',
    '  once: boolean;',
    '}',
    '',
    'export interface BusOptions {',
    '  maxListeners: number;',
    '  errorHandler?: (error: Error) => void;',
    '  debug?: boolean;',
    '}',
    '',
    'const DEFAULT_OPTIONS: BusOptions = {',
    '  maxListeners: 100,',
    '  debug: false,',
    '};',
    '',
    'export class EventBus<Events extends EventMap = EventMap> {',
    '  private subscriptions: Map<string, Subscription[]> = new Map();',
    '  private options: BusOptions;',
    '  private idCounter = 0;',
    '',
    '  constructor(options: Partial<BusOptions> = {}) {',
    '    this.options = { ...DEFAULT_OPTIONS, ...options };',
    '  }',
    '',
    '  on<K extends keyof Events & string>(event: K, handler: EventHandler<Events[K]>): string {',
    '    return this.addSubscription(event, handler as EventHandler<unknown>, false);',
    '  }',
    '',
    '  once<K extends keyof Events & string>(event: K, handler: EventHandler<Events[K]>): string {',
    '    return this.addSubscription(event, handler as EventHandler<unknown>, true);',
    '  }',
    '',
    '  off(subscriptionId: string): boolean {',
    '    for (const [event, subs] of this.subscriptions) {',
    '      const idx = subs.findIndex((s) => s.id === subscriptionId);',
    '      if (idx >= 0) {',
    '        subs.splice(idx, 1);',
    '        if (subs.length === 0) {',
    '          this.subscriptions.delete(event);',
    '        }',
    '        return true;',
    '      }',
    '    }',
    '    return false;',
    '  }',
    '',
    '  async emit<K extends keyof Events & string>(event: K, payload: Events[K]): Promise<void> {',
    '    const subs = this.subscriptions.get(event);',
    '    if (!subs || subs.length === 0) {',
    '      return;',
    '    }',
    '',
    '    const toRemove: string[] = [];',
    '',
    '    for (const sub of subs) {',
    '      try {',
    '        await sub.handler(payload);',
    '      } catch (error) {',
    '        if (this.options.errorHandler) {',
    '          this.options.errorHandler(error instanceof Error ? error : new Error(String(error)));',
    '        }',
    '      }',
    '      if (sub.once) {',
    '        toRemove.push(sub.id);',
    '      }',
    '    }',
    '',
    '    for (const id of toRemove) {',
    '      this.off(id);',
    '    }',
    '  }',
    '',
    '  listenerCount(event: string): number {',
    '    return this.subscriptions.get(event)?.length ?? 0;',
    '  }',
    '',
    '  eventNames(): string[] {',
    '    return Array.from(this.subscriptions.keys());',
    '  }',
    '',
    '  removeAllListeners(event?: string): void {',
    '    if (event) {',
    '      this.subscriptions.delete(event);',
    '    } else {',
    '      this.subscriptions.clear();',
    '    }',
    '  }',
    '',
    '  private addSubscription(event: string, handler: EventHandler<unknown>, once: boolean): string {',
    '    const id = `sub_${++this.idCounter}`;',
    '    const sub: Subscription = { id, event, handler, once };',
    '',
    '    const existing = this.subscriptions.get(event) ?? [];',
    '    if (existing.length >= this.options.maxListeners) {',
    '      throw new Error(`Max listeners (${this.options.maxListeners}) reached for event: ${event}`);',
    '    }',
    '',
    '    existing.push(sub);',
    '    this.subscriptions.set(event, existing);',
    '',
    '    if (this.options.debug) {',
    '      console.log(`[EventBus] Subscribed ${id} to ${event}`);',
    '    }',
    '',
    '    return id;',
    '  }',
    '}',
    '',
  ];

  // Pad to ~300 lines with utility functions
  while (lines.length < 290) {
    const idx = lines.length;
    lines.push(
      `/** Helper function ${idx} for benchmark corpus. */`,
      `export function processItem${idx}(input: string): string {`,
      `  if (!input) {`,
      `    return 'empty';`,
      `  }`,
      `  return \`processed:\${input}\`;`,
      `}`,
      '',
    );
  }

  const content = lines.join('\n');

  return {
    id: 'ts-medium-eventbus',
    language: 'typescript',
    size: 'medium',
    lineCount: content.split('\n').length,
    content,
    description: 'Typed event bus with generics, async, error handling',
    characteristics: {
      functionCount: 10,
      typeCount: 5,
      importCount: 0,
      maxNestingDepth: 4,
      hasGenerics: true,
      hasAsync: true,
      hasErrorHandling: true,
    },
  };
}

function buildTSLarge(): TestCorpusFile {
  return generatePaddedFile('typescript', 'large', 1000);
}

function buildTSXL(): TestCorpusFile {
  return generatePaddedFile('typescript', 'xl', 5000);
}

// ============================================================================
// File Generator (for large/XL sizes)
// ============================================================================

/**
 * Generates a padded file to reach the target line count.
 * Uses the medium file as a seed and adds generated functions/structs.
 */
function generatePaddedFile(
  language: SupportedLanguage,
  size: FileSize,
  targetLines: number
): TestCorpusFile {
  const lines: string[] = [];
  let functionCount = 0;
  let typeCount = 0;

  // Add language-specific header
  switch (language) {
    case 'go':
      lines.push('package benchmark', '', 'import (', '\t"fmt"', '\t"strings"', '\t"strconv"', ')', '');
      break;
    case 'rust':
      lines.push('use std::collections::HashMap;', 'use std::fmt;', '');
      break;
    case 'typescript':
      lines.push('/**', ` * Generated ${size} benchmark file.`, ' */', '');
      break;
  }

  // Generate types every ~100 lines
  while (lines.length < targetLines - 10) {
    const idx = lines.length;

    // Insert a type/struct every ~80 lines
    if (idx % 80 === 0) {
      typeCount++;
      switch (language) {
        case 'go':
          lines.push(
            `// Entity${typeCount} represents a benchmark entity.`,
            `type Entity${typeCount} struct {`,
            `\tID    int`,
            `\tName  string`,
            `\tValue float64`,
            `\tTags  []string`,
            '}',
            '',
          );
          break;
        case 'rust':
          lines.push(
            `/// Entity ${typeCount} for benchmark.`,
            `#[derive(Debug, Clone)]`,
            `pub struct Entity${typeCount} {`,
            `    pub id: u64,`,
            `    pub name: String,`,
            `    pub value: f64,`,
            `    pub tags: Vec<String>,`,
            '}',
            '',
          );
          break;
        case 'typescript':
          lines.push(
            `/** Entity ${typeCount} for benchmark. */`,
            `export interface Entity${typeCount} {`,
            `  id: number;`,
            `  name: string;`,
            `  value: number;`,
            `  tags: string[];`,
            '}',
            '',
          );
          break;
      }
    }

    // Generate a function
    functionCount++;
    switch (language) {
      case 'go':
        lines.push(
          `// Process${functionCount} transforms input data.`,
          `func Process${functionCount}(input string, count int) (string, error) {`,
          `\tif len(input) == 0 {`,
          `\t\treturn "", fmt.Errorf("empty input for Process${functionCount}")`,
          `\t}`,
          `\tvar result strings.Builder`,
          `\tfor i := 0; i < count; i++ {`,
          `\t\tresult.WriteString(input)`,
          `\t\tresult.WriteString(strconv.Itoa(i))`,
          `\t}`,
          `\treturn result.String(), nil`,
          '}',
          '',
        );
        break;
      case 'rust':
        lines.push(
          `/// Process function ${functionCount}.`,
          `pub fn process_${functionCount}(input: &str, count: usize) -> Result<String, String> {`,
          `    if input.is_empty() {`,
          `        return Err(format!("empty input for process_${functionCount}"));`,
          `    }`,
          `    let mut result = String::with_capacity(input.len() * count);`,
          `    for i in 0..count {`,
          `        result.push_str(input);`,
          `        result.push_str(&i.to_string());`,
          `    }`,
          `    Ok(result)`,
          `}`,
          '',
        );
        break;
      case 'typescript':
        lines.push(
          `/** Process function ${functionCount}. */`,
          `export function process${functionCount}(input: string, count: number): string {`,
          `  if (!input) {`,
          `    throw new Error(\`empty input for process${functionCount}\`);`,
          `  }`,
          `  const parts: string[] = [];`,
          `  for (let i = 0; i < count; i++) {`,
          `    parts.push(\`\${input}\${i}\`);`,
          `  }`,
          `  return parts.join('');`,
          `}`,
          '',
        );
        break;
    }
  }

  const content = lines.join('\n');

  return {
    id: `${language}-${size}-generated`,
    language,
    size,
    lineCount: content.split('\n').length,
    content,
    description: `Generated ${size} ${language} file (~${targetLines} lines) with ${functionCount} functions and ${typeCount} types`,
    characteristics: {
      functionCount,
      typeCount,
      importCount: language === 'go' ? 3 : language === 'rust' ? 2 : 0,
      maxNestingDepth: 3,
      hasGenerics: language !== 'go',
      hasAsync: false,
      hasErrorHandling: true,
    },
  };
}

// ============================================================================
// Transform Specs
// ============================================================================

/**
 * Standard transform specifications for benchmarking.
 */
export function getStandardTransforms(): Record<string, TransformSpec> {
  return {
    'rename-function': {
      kind: 'rename-function',
      description: 'Rename a function (simple AST node text replacement)',
      complexity: 'simple',
      params: {
        // The harness picks the first function in the file
        newNameSuffix: 'Renamed',
      },
    },
    'change-visibility': {
      kind: 'change-visibility',
      description: 'Change visibility of all types (e.g. pub->pub(crate), export->internal)',
      complexity: 'moderate',
      params: {
        direction: 'restrict', // make things less visible
      },
    },
    'add-type-annotations': {
      kind: 'add-type-annotations',
      description: 'Add type annotations to untyped parameters/returns',
      complexity: 'moderate',
      params: {
        inferTypes: true,
      },
    },
    'add-error-handling': {
      kind: 'add-error-handling',
      description: 'Wrap all function bodies in error handling (try/catch, Result, if err)',
      complexity: 'complex',
      params: {
        errorStyle: 'language-default',
      },
    },
    'extract-function': {
      kind: 'extract-function',
      description: 'Extract a block of code into a new function and replace with call',
      complexity: 'complex',
      params: {
        // Extract the body of the first function with >5 statements
        minStatements: 5,
        newFunctionName: 'extractedHelper',
      },
    },
  };
}
