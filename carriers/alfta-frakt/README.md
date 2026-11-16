# Alfta Frakt

Alfta Frakt parcels use enabled universal providers. There is no dedicated adapter.

Alfta Frakt is a transport and logistics company in Alfta, Hälsingland, with warehouses in
Stockholm and Gävle, working across Sweden.

## Numbers

No public page shows an Alfta Frakt number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /tt/api/internal/<number>`. No public number is known to
check its replies against.

## Links

Alfta Frakt's Opter tracking page lives at `alftafraktse.opter.cloud`, where `/tt?keyword=<number>`
opens one parcel. Opter hosts many carriers, so only Alfta Frakt's subdomain is read.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
