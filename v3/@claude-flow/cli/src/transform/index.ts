/**
 * AST Transform Instruction DSL
 *
 * Public API for expressing and executing arbitrary code transformations
 * via structured, serializable instructions.
 *
 * @see ADR-066: AST Transform Instruction DSL
 * @module transform
 */

// Core types
export type {
  // Language
  Language,

  // Operations
  TransformOperation,

  // Node Selectors
  NodeSelector,
  NodeKindSelector,
  PortableNodeKind,
  NameSelector,
  PathSelector,
  PatternSelector,
  PositionSelector,
  SemanticSelector,
  SemanticRole,

  // Predicates
  Predicate,
  PredicateType,
  NumericComparison,

  // Parameters
  TransformParams,
  NamingConvention,
  Visibility,
  Modifier,
  DeclarationKind,

  // Instructions
  TransformInstruction,
  CompositeTransform,
  ExecutionStrategy,

  // Results
  TransformResult,
  InstructionResult,
  FileDiff,

  // NL Bridge
  NLContext,
  NLTranslationResult,
  NLRule,
} from './types.js';
