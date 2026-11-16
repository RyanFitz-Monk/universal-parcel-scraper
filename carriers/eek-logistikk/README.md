# Eek Logistikk

Eek Logistikk parcels use enabled universal providers. There is no dedicated adapter.

Eek Logistikk is a Norwegian general cargo and express carrier with its own terminal at Hjuksebø
and approval for dangerous goods.

## Numbers

No public page shows an Eek Logistikk number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /opter/tt/api/internal/<number>`. No public number is known to
check its replies against.

## Links

The site's Sporing link opens Eek Logistikk's Opter tracking page over HTTP; the catalog uses its
HTTPS address at `eek.driftcentral.net`, where `/opter/tt?keyword=<number>` opens one parcel. Opter
hosts many carriers there, so only Eek Logistikk's subdomain is read.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
