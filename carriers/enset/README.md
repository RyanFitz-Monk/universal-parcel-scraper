# Enset

Enset parcels use enabled universal providers. There is no dedicated adapter.

Enset is a Finnish carrier with terminals in Pirkkala near Tampere, Turku, Vantaa and Pori. It runs
scheduled distribution, early, overnight and same-day deliveries, crane, temperature-controlled and
ADR transport, and trunk routes between its terminals.

## Numbers

No public page shows an Enset number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /tt/api/internal/<number>`. No public number is known to check its
replies against.

## Links

Enset's Opter tracking page lives at `ensetfi.opter.cloud`, where `/TT?keyword=<number>` opens one
parcel. Opter hosts many carriers, so only Enset's subdomain is read.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
