# HSS Transport

HSS Transport parcels use enabled universal providers. There is no dedicated adapter.

HSS Transport is a carrier in Sandvika that runs distribution, crane trucks, express, special
transport and courier vans, and brokers freight. Its sister company is HSS Kran og Spesialtransport.

## Numbers

No public page shows an HSS Transport number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /tt/api/internal/<number>`. No public number is known to check its
replies against.

## Links

HSS Transport's Opter tracking page lives at `hssno.opter.cloud`, where `/TT?keyword=<number>`
opens one parcel. Opter hosts many carriers, so only HSS Transport's subdomain is read.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
