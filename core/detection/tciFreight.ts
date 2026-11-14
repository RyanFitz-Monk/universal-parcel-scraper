/** Dockets accepted by Freight's guest form; this does not identify their issuer. */
export function isTciFreightReference(number: string): boolean {
  return /^\d{9}$/.test(number);
}
