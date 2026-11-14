/** The ordinary ANE freight waybill supported by this guest lookup. */
export function isAneLogisticsReference(number: string): boolean {
  return /^[1-9]\d{11}$/.test(number);
}
