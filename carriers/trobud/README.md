# Trobud

Trobud parcels use enabled universal providers. There is no dedicated adapter.

Trobud is a Tromsø courier founded in 2005 to continue Tromsø Bud-Ekspress, and its vans cover most
of Troms. It also delivers DHL Express parcels in Troms; those keep their DHL numbers and are tracked
at [DHL Express](../dhl-express/README.md).

## Numbers

No public page shows a Trobud number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /tt/api/internal/<number>`. No public number is known to check its
replies against.

## Links

Trobud's Opter tracking page lives at `trobudno.opter.cloud`, where `/TT?keyword=<number>` opens
one parcel. Opter hosts many carriers, so only Trobud's subdomain is read.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
