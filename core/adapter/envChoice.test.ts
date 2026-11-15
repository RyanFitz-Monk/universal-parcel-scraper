import { afterEach, describe, expect, it, vi } from 'vitest';
import { envChoice, envPercent } from './envChoice.js';

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

describe('envPercent', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('reads a number from 0 to 100, and the fallback when the setting is absent or blank', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(envPercent({ SHARE_A: ' 25 ' }, 'SHARE_A', 50)).toBe(25);
    expect(envPercent({ SHARE_A: '0' }, 'SHARE_A', 50)).toBe(0);
    expect(envPercent({ SHARE_A: '100' }, 'SHARE_A', 50)).toBe(100);
    expect(envPercent({ SHARE_A: '12.5' }, 'SHARE_A', 50)).toBe(12.5);
    expect(envPercent({}, 'SHARE_A', 50)).toBe(50);
    expect(envPercent({ SHARE_A: ' ' }, 'SHARE_A', 50)).toBe(50);
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back on any other value with one warning per setting that leaves the value out', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const value of ['50%', '-1', '101', 'half', 'Infinity']) expect(envPercent({ SHARE_B: value }, 'SHARE_B', 50)).toBe(50);
    expect(envPercent({ SHARE_C: 'x' }, 'SHARE_C', 10)).toBe(10);
    expect(warn.mock.calls).toEqual([['SHARE_B must be a number from 0 to 100; using 50'], ['SHARE_C must be a number from 0 to 100; using 10']]);
  });
});
