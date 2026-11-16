# Lillebil

Lillebil parcels use enabled universal providers. There is no dedicated adapter.

Lillebil is a Stockholm transport company in Skarpnäck. Together with its sister company Lillebud it
runs courier vans, refrigerated vans, trucks and crane trucks.

## Numbers

No public page shows a Lillebil number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /opter/tt/api/internal/<number>`. No public number is known to
check its replies against.

## Links

Lillebil's Opter tracking page lives at `kundportal.lillebil.se`, where
`/opter/TT?keyword=<number>` opens one parcel.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
