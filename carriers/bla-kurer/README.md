# Blå Kurér

Blå Kurér parcels use enabled universal providers. There is no dedicated adapter.

Blå Kurér is a carrier in Porsgrunn with groupage routes, routes to Sørlandet and local routes. It
also runs courier, express and fixed distribution, brokers freight and handles air freight.

## Numbers

No public page shows a Blå Kurér number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /tt/api/internal/<number>`. No public number is known to check its
replies against.

## Links

The tracking form on Blå Kurér's site sends the waybill number to its Opter tracking page at
`blakurerno.opter.cloud`, where `/tt?keyword=<number>` opens one parcel. Opter hosts many carriers,
so only Blå Kurér's subdomain is read.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
