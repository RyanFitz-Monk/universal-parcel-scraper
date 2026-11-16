# Varubud

Varubud parcels use enabled universal providers. There is no dedicated adapter.

Varubud is a carrier in Eskilstuna, with a terminal in Västerås, for courier work, scheduled
routes, cold transport, dangerous goods and storage in Mälardalen.

## Numbers

No public page shows a Varubud number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /tt/api/internal/<number>`. No public number is known to
check its replies against.

## Links

Varubud's Opter tracking page lives at `varubudse.opter.cloud`, where `/tt?keyword=<number>` opens
one parcel. Opter hosts many carriers, so only Varubud's subdomain is read.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
