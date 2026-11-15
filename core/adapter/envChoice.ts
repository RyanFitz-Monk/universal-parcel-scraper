/** Setting names already warned about in this process: a misspelt value is reported once. */
const warned = new Set<string>();

/**
 * A setting that takes one of a few words. An unknown value falls back to `fallback` with one
 * warning naming the setting, so a typo in a deployment never fails its lookups.
 */
export function envChoice<const T extends string>(env: Readonly<Record<string, string | undefined>>, name: string,
  choices: readonly T[], fallback: T): T {
  const value = env[name]?.trim();
  if (!value) return fallback;
  if ((choices as readonly string[]).includes(value)) return value as T;
  if (!warned.has(name)) {
    warned.add(name);
    console.warn(`${name} must be ${choices.join(', ')}; using ${fallback}`);
  }
  return fallback;
}
