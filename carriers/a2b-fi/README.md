# A2B

A2B parcels use enabled universal providers. There is no dedicated adapter.

A2B (A to B Finland Oy) is a Helsinki courier for companies in Helsinki, Espoo, Vantaa and the Turku
and Tampere regions, with vans and trucks that run on biogas made from waste or on wind power. It
carries express shipments, home deliveries for web shops and temperature-controlled food.

## Numbers

No public page shows an A2B number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /tt/api/internal/<number>`. No public number is known to check its
replies against.

## Links

A2B's Opter tracking page lives at `a2bfi.opter.cloud`, where `/TT?keyword=<number>` opens one
parcel. Opter hosts many carriers, so only A2B's subdomain is read.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
