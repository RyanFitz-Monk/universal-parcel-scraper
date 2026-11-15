# CargoMini

CargoMini parcels use enabled universal providers. There is no dedicated adapter.

CargoMini is the tracked e-commerce export service of KargomKolay, a brand of DRN Lojistik A.Ş. in
Istanbul. It gives each consignment its own number, flies it out of Turkey and hands it to a local
carrier for the last mile, such as GLS, DHL eCommerce or Saudi Post. KargomKolay's express
shipments travel on DHL, UPS, FedEx and TNT labels and belong to those carriers.

## Numbers

No public page shows a CargoMini number, so there is no rule.

## Why there is no adapter

No public number is known to check the tracker's replies against.

## Leads

The tracker reads `GET api.kargomkolay.com/v1/tracking/<number>`, a JSON reply with the
consignment's events and the last-mile carrier's name and number; an unknown number gets HTTP 404.

## Links

The tracker takes the number as its path, so `tracking.cargomini.com/<number>` opens one
consignment.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
