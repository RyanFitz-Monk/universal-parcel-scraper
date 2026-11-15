/**
 * Detection rule matching.
 *
 * What it is: whether a catalog detection rule's pattern fits a normalized
 * number and its rawPattern the printed one, with each rule's expressions
 * compiled once, and whether a rule rests on its check digit alone. Detection
 * and recognition share it.
 * What it is not: no checksum and no carrier choice.
 */
import type { DetectionRule } from '../catalog/types.js';

export interface CompiledRule { readonly pattern: RegExp; readonly rawPattern?: RegExp }

const compiled = new WeakMap<DetectionRule, CompiledRule>();

/** The rule's expressions, compiled on first use. */
export function compiledRule(rule: DetectionRule): CompiledRule {
  let expressions = compiled.get(rule);
  if (!expressions) {
    expressions = { pattern: new RegExp(rule.pattern), ...(rule.rawPattern ? { rawPattern: new RegExp(rule.rawPattern) } : {}) };
    compiled.set(rule, expressions);
  }
  return expressions;
}

/** The compiled pattern fits the normalized number, and its rawPattern, if any, the printed input. */
export function compiledRuleFits(expressions: CompiledRule, normalized: string, printed: string): boolean {
  return expressions.pattern.test(normalized) && (!expressions.rawPattern || expressions.rawPattern.test(printed));
}

/** The rule's pattern fits the normalized number, and its rawPattern, if any, the printed input. */
export function ruleFits(rule: DetectionRule, normalized: string, printed: string): boolean {
  return compiledRuleFits(compiledRule(rule), normalized, printed);
}

/** A pattern that is a bare run of digits: only its check digit points to its carrier. */
const BARE_DIGITS = /^\^(?:\\d|\[0-9\])\{\d+\}\$$/;

/** The rule takes any run of digits of its length, and only its check digit backs its carrier. */
export function restsOnCheckDigit(rule: DetectionRule): boolean {
  return rule.checksum !== undefined && BARE_DIGITS.test(rule.pattern);
}
