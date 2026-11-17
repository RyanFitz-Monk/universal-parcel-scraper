# ATC Express

ATC Express parcels use enabled universal providers. There is no dedicated adapter.

ATC Express, ООО «ТРАНС АТЛАНТИК» of Moscow, carries samples and documents by air from China to
any Russian town: it collects them or takes them in at its warehouse in China, clears them through
customs in Moscow and has a courier deliver them.

## Numbers

Its tracker takes a tracking number or an order number. No public page shows one, so there is no
rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Leads

The tracking page reads `GET https://atc.express/api/tracking/find/<number>`, which answers JSON.

## Links

`atc.express/search/<number>` opens one shipment, and the library reads the number from that
address.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
