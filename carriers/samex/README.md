# Samex

Samex parcels use enabled universal providers. There is no dedicated adapter.

Samex is a Chilean freight and parcel carrier with branches from Santiago to the south.

## Numbers

Its tracker takes a transport order number of nine to twelve digits. No public page shows a Samex
number, and such digits are a shape many carriers share, so there is no rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Links

The tracking form opens
`mysamex.samex.cl/gts/pub/locNumSeguimiento.seam?tipo=L&localizador=<number>`, and the library reads
the number from that address. Without a number that address leads to an error page, so the health
check reads the form.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
