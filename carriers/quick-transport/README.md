# Quick Transport

Quick Transport parcels use enabled universal providers. There is no dedicated adapter.

Quick Transport is a Norwegian carrier in Bryne, Rogaland, with its own terminal for
temperature-controlled transfer and storage. It runs everything from courier vans to semitrailers on
long-haul routes across Norway, ADR transport included, around the clock.

## Numbers

No public page shows a Quick Transport number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /tt/api/internal/<number>`. No public number is known to check its
replies against.

## Links

Quick Transport's Opter tracking page lives at `quickno.opter.cloud`, where
`/TT?keyword=<number>` opens one parcel. Opter hosts many carriers, so only Quick Transport's
subdomain is read.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
