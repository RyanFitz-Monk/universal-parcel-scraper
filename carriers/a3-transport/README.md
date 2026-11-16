# A3 Transport

A3 Transport parcels use enabled universal providers. There is no dedicated adapter.

A3 Transport is a Norwegian carrier with a terminal in Sandnes, serving Rogaland and parts of
Vestland and Agder. It runs economy routes, express and distribution, and stores goods in its
warehouse.

## Numbers

No public page shows an A3 Transport number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /tt/api/internal/<number>`. No public number is known to check its
replies against.

## Links

The site's Sporing link opens A3 Transport's Opter tracking page at `a3transportno.opter.cloud`,
where `/tt?keyword=<number>` opens one parcel. Opter hosts many carriers, so only A3 Transport's
subdomain is read.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
