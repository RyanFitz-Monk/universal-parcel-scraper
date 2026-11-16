# Kurér

Kurér parcels use enabled universal providers. There is no dedicated adapter.

Kurér is a carrier in Kongsvinger with tailored transport and fixed freight routes over much of
Eastern Norway, reaching Halden, Hokksund and Lillehammer.

## Numbers

No public page shows a Kurér number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /opter/tt/api/internal/<number>`. No public number is known to
check its replies against.

## Links

The site's Spor din sending link opens Kurér's Opter tracking page at `opter.kurer.no`, where
`/opter/tt?keyword=<number>` opens one parcel.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
