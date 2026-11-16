# Apollo Budbiler

Apollo Budbiler parcels use enabled universal providers. There is no dedicated adapter.

Apollo Budbiler is a Norwegian courier and freight company in Mjøndalen, Drammen, founded in 1985.
It runs groupage, distribution, express and truck transport across Norway and abroad, along with
warehousing and temperature-controlled transport.

## Numbers

No public page shows an Apollo Budbiler number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /tt/api/internal/<number>`. No public number is known to check its
replies against.

## Links

The site's Pakkesporing link opens Apollo Budbiler's Opter tracking page at `apollono.opter.cloud`,
where `/TT?keyword=<number>` opens one parcel. Opter hosts many carriers, so only Apollo Budbiler's
subdomain is read.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
