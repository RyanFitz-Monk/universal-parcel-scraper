# Bergen Transport Sentral

Bergen Transport Sentral parcels use enabled universal providers. There is no dedicated adapter.

Bergen Transport Sentral is a Bergen transport company for courier work and road, sea, air and rail
freight, with third-party logistics.

## Numbers

No public page shows a Bergen Transport Sentral number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /tt/api/internal/<number>`. No public number is known to
check its replies against.

## Links

The site's Pakkesporing link opens Bergen Transport Sentral's Opter tracking page at
`bergentsno.opter.cloud`, where `/tt?keyword=<number>` opens one parcel. Opter hosts many carriers,
so only Bergen Transport Sentral's subdomain is read.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
