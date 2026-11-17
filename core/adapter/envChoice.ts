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
  warnOnce(name, `${name} must be ${choices.join(', ')}; using ${fallback}`);
  return fallback;
}

/**
 * A setting that takes a percentage. A value that is no number from 0 to 100 falls back to
 * `fallback` with one warning naming the setting, as `envChoice` does.
 */
export function envPercent(env: Readonly<Record<string, string | undefined>>, name: string, fallback: number): number {
  const value = env[name]?.trim();
  if (!value) return fallback;
  const percent = Number(value);
  if (Number.isFinite(percent) && percent >= 0 && percent <= 100) return percent;
  warnOnce(name, `${name} must be a number from 0 to 100; using ${fallback}`);
  return fallback;
}

/**
 * A setting that takes a positive number. Anything else falls back to `fallback` with one warning
 * naming the setting, as `envChoice` does.
 */
export function envPositive(env: Readonly<Record<string, string | undefined>>, name: string, fallback: number): number {
  const value = env[name]?.trim();
  if (!value) return fallback;
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return number;
  warnOnce(name, `${name} must be a positive number; using ${fallback}`);
  return fallback;
}

function warnOnce(name: string, message: string): void {
  if (warned.has(name)) return;
  warned.add(name);
  console.warn(message);
}
