# Andesmar Cargas

Andesmar Cargas parcels use enabled universal providers. There is no dedicated adapter.

Andesmar Cargas is the parcel and freight arm of the Andesmar bus group from Mendoza, with more than
300 branches across Argentina.

## Numbers

Its receipts print a fifteen-digit tracking number beside the guide number, a branch code and a
letter. No public page shows a real Andesmar number, and fifteen digits are a shape many carriers
share, so there is no rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Links

`/seguimiento?numero=<number>&tipo=seguimiento` looks a tracking number up, and the library reads
the number from that address. Addresses with another `tipo` hold a guide, remito or order number,
which the library leaves alone.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
