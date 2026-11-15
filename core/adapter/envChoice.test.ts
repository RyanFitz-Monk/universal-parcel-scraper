import { afterEach, describe, expect, it, vi } from 'vitest';
import { envChoice } from './envChoice.js';

describe('envChoice', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('reads a known word, and the fallback when the setting is absent or blank', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const choices = ['default', 'proxy'] as const;
    expect(envChoice({ ROUTE_A: ' proxy ' }, 'ROUTE_A', choices, 'default')).toBe('proxy');
    expect(envChoice({}, 'ROUTE_A', choices, 'default')).toBe('default');
    expect(envChoice({ ROUTE_A: '  ' }, 'ROUTE_A', choices, 'default')).toBe('default');
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back on an unknown word with one warning per setting that leaves the value out', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const choices = ['default', 'proxy'] as const;
    for (const value of ['Proxy', 'proxy-first', 'Proxy']) expect(envChoice({ ROUTE_B: value }, 'ROUTE_B', choices, 'default')).toBe('default');
    expect(envChoice({ ROUTE_C: 'x' }, 'ROUTE_C', choices, 'default')).toBe('default');
    expect(warn.mock.calls).toEqual([['ROUTE_B must be default, proxy; using default'], ['ROUTE_C must be default, proxy; using default']]);
  });
});
