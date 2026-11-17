/** HayPost's clock at home: Armenia keeps one, Yerevan's. */
export const HAYPOST_ZONE = 'Asia/Yerevan';

/**
 * Whether a HayPost scan is a sending post's despatch that HayPost has from that post's
 * electronic data, "Send item abroad (EDI-received)". Its clock is HayPost's, wherever the row
 * places it: Russian Post's despatch to Armenia, read on Moscow's clock, came an hour after
 * HayPost's tracker listed it.
 */
export function haypostEdiReceived(wording: string): boolean {
  return /\(edi-received\)$/i.test(wording.trim());
}
