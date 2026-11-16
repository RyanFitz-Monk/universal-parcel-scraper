# Sandahls

Sandahls parcels use enabled universal providers. There is no dedicated adapter.

Sandahls is a family-owned Swedish transport group based in Värnamo since 1949. Sandahls Logistik
carries road freight, from business and home deliveries to temperature-controlled, express and
international shipments, and Real Rail Sweden runs its rail freight.

## Numbers

No public page shows a Sandahls number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /opter/tt/api/internal/<number>`. No public number is known to
check its replies against.

## Links

Sandahls' Opter tracking page lives at `portal.sandahlsbolagen.se`, where
`/opter/TT?keyword=<number>` opens one parcel.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
