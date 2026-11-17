/**
 * PostNL's customs stamps, which its own feed dates as UTC instants to the fraction of a second wherever it dates
 * its other scans locally (adapter.ts). Universal providers that copy them give their UTC digits.
 */
export const POSTNL_CUSTOMS_STAMP = /^(?:pre-declaration of the item has been received|item is cleared|duties and taxes confirmed) by customs$/i;
