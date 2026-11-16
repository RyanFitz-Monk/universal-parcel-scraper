# EM Distribusjon

EM Distribusjon parcels use enabled universal providers. There is no dedicated adapter.

EM Distribusjon is a carrier in Bygstad, Sunnfjord, with courier vans, express freight, fixed routes
and early-morning deliveries.

## Numbers

No public page shows an EM Distribusjon number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /tt/api/internal/<number>`. No public number is known to
check its replies against.

## Links

The site's Kunde web link opens EM Distribusjon's Opter pages at `emdno.opter.cloud`, where
`/tt?keyword=<number>` opens one parcel. Opter hosts many carriers, so only EM Distribusjon's
subdomain is read.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
