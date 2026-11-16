# LoadMaster

LoadMaster parcels use enabled universal providers. There is no dedicated adapter.

LoadMaster is a Norwegian carrier in Lillestrøm for general cargo and part loads, home and crane
deliveries, motorcycle transport and storage.

## Numbers

No public page shows a LoadMaster number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /tt/api/internal/<number>`. No public number is known to
check its replies against.

## Links

The site's Sporing link opens LoadMaster's Opter tracking page at `loadmasterno.opter.cloud`, where
`/tt?keyword=<number>` opens one parcel. Opter hosts many carriers, so only LoadMaster's subdomain
is read.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
