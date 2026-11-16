# Hadeland Bud

Hadeland Bud parcels use enabled universal providers. There is no dedicated adapter.

Hadeland Bud og Varetransport is a carrier in Jaren, Innlandet, with courier vans and fixed routes
in Innlandet, Oslo and Drammen.

## Numbers

No public page shows a Hadeland Bud number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /tt/api/internal/<number>`. No public number is known to
check its replies against.

## Links

The site's tracking button opens Hadeland Bud's Opter tracking page at `hadelandbudno.opter.cloud`,
where `/tt?keyword=<number>` opens one parcel. Opter hosts many carriers, so only Hadeland Bud's
subdomain is read.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
