# Maldives Post

Maldives Post parcels use enabled universal providers. There is no dedicated adapter.

Maldives Post is the national post of the Maldives, in Malé. It also runs EMS and etukuri, a
delivery service for online shops.

## Numbers

It gives international items UPU S10 numbers ending in `MV`. Generic postal detection handles these
numbers, so no rule for Maldives Post claims them.

## Why there is no adapter

Its website answers with a Cloudflare challenge, which a browser passes by itself. No public number
is known to check its tracker's replies against.

## Leads

The tracker posts JSON with `tracking_number` and the `request_number` its page carries to
`/api/local-tracking`, with the page's Laravel session token.

## Links

`maldivespost.com/tracker?tracking_number=<number>` fills the number in and looks it up, and the
library reads the number from that address.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
