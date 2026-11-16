/** The app's ordinary domestic waybill input; its TKP01 partner branch is separate. */
export function isSicepatReference(number: string): boolean {
  return /^\d{12}$/.test(number);
}
