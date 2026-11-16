# Småfrakt

Småfrakt parcels use enabled universal providers. There is no dedicated adapter.

Småfrakt is a Swedish carrier of parcels and pallets on its own routes in Mälardalen and Stockholm.
It also runs express and direct vans, temperature-controlled courier work with certified sensors, and
ADR transport.

## Numbers

No public page shows a Småfrakt number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /tt/api/internal/<number>`. No public number is known to check its
replies against.

## Links

Småfrakt's Opter tracking page lives at `smafraktse.opter.cloud`, where `/TT?keyword=<number>`
opens one parcel. Opter hosts many carriers, so only Småfrakt's subdomain is read.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
