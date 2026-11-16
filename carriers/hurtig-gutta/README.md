# Hurtig-Gutta

Hurtig-Gutta parcels use enabled universal providers. There is no dedicated adapter.

Hurtig-Gutta is a privately owned Norwegian carrier in Skjetten, founded in 1998, with its own
routes and fixed daily departures across Eastern Norway. It runs courier vans, express, trucks,
distribution and special transport.

## Numbers

No public page shows a Hurtig-Gutta number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /tt/api/internal/<number>`. No public number is known to check its
replies against.

## Links

The site's Pakkesporing link opens Hurtig-Gutta's Opter tracking page at
`hurtigguttano.opter.cloud`, where `/tt?keyword=<number>` opens one parcel. Opter hosts many
carriers, so only Hurtig-Gutta's subdomain is read.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
