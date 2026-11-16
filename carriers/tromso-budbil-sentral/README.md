# Tromsø Budbil Sentral

Tromsø Budbil Sentral parcels use enabled universal providers. There is no dedicated adapter.

Tromsø Budbil Sentral is a courier company in Tromsø, part of the DANX Carousel Group.

## Numbers

No public page shows a Tromsø Budbil Sentral number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /tt/api/internal/<number>`. No public number is known to
check its replies against.

## Links

The Pakkesporing box on the site opens Tromsø Budbil Sentral's Opter tracking page at
`tbsno.opter.cloud`, where `/tt?keyword=<number>` opens one parcel. Opter hosts many carriers, so
only Tromsø Budbil Sentral's subdomain is read.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
