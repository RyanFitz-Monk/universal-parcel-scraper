# Khazenly

Khazenly parcels use enabled universal providers. There is no dedicated adapter.

Khazenly is an Egyptian fulfilment and delivery company for online shops. Recipients follow its
order references on its own tracking page.

## Numbers

Its tracker takes a Khazenly order reference. No public page shows one, so there is no rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Leads

The tracking page sends a GET to
`https://tracking-api.khazenly.com/api/v1/tracking/?referenceNumber=<number>`.

## Links

`track.khazenly.com/?referenceNumber=<number>` looks one order up (`&lang=en` or `&lang=ar` picks
the language), and the library reads the number from that address.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
