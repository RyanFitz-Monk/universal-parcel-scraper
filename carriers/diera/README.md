# DIERA

DIERA parcels use enabled universal providers. There is no dedicated adapter.

DIERA is a Polish forwarder in Warsaw with eleven branches, for parcels, part and full loads, and
road, sea, air and rail freight.

## Numbers

No public page shows a DIERA number, so there is no rule.

## Why there is no adapter

The tracker's script reads a parcel from `dot.diera.pl/api/parcel/tracking/info/<number>` with a
token the page's own script carries. No public number is known to check its replies against.

## Links

`tracking.diera.pl/?usn=<number>` only fills in the form, so the catalog sends people to the
tracking page.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
