# Meyership

Meyership parcels use enabled universal providers. There is no dedicated adapter.

Meyership is a transport and logistics company in Mo i Rana serving Helgeland, with road, air, sea,
container and rail freight and warehousing. Its group includes Meyership Logistikk and Mosjøen
Transport.

## Numbers

No public page shows a Meyership number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /ms/opter/tt/api/internal/<number>`. No public number is known to
check its replies against.

## Links

Meyership's Opter tracking page lives at `kundeportal.meyership.no`, where
`/ms/opter/TT?keyword=<number>` opens one parcel.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
