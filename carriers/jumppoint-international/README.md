# Jumppoint International Express

Tracks Jumppoint's international waybills through its anonymous guest portal. The domestic
network has a separate [Jumppoint adapter](../jumppoint/README.md).

## How it works

1. `trawl`: opens the official `int-tracking.jumppoint.io/?q=` page. Its native reCAPTCHA flow
   obtains a fresh token and calls `int-tracking-api.jumppoint.io/shipment/tracking/`.
   The adapter binds the captured query and returned tracking number to the whole input.

Requires TRAWL. Recognition is browser-only and opt-in; HTTP recognition starts no browser.
The newest bound reply decides, including refusals. An empty echoed identifier stays inconclusive,
so enabled universal providers remain available. Tokens stay inside the browser lookup.

The translated scan labels supply stages. Scan instants keep the offsets the API supplies;
an offset-less clock is an unsupported reply and leaves provider fallback available. Recipient fields, references and free-text remarks are omitted. The
international layout stays separate from the domestic network's numeric waybills.

## Testing

Set `FLARESOLVERR_URL`, `JUMPPOINT_INTERNATIONAL_TRACKING_NUMBER` and optionally
`JUMPPOINT_INTERNATIONAL_UNKNOWN_NUMBER`, then run
`npm run test:carriers:live -- carriers/jumppoint-international`.
