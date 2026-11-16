# TSN Groen

TSN Groen parcels use enabled universal providers. There is no dedicated adapter.

TSN Groen is a Dutch carrier in Houten that delivers furniture and white goods to homes, with one
or two people and emission-free vehicles.

## Numbers

The delivery page takes a shipment number or barcode with the delivery postcode, or a tracking code
on its own. No public page shows one, so there is no rule.

## Why there is no adapter

The delivery page is TSN Groen's tenant of the Dirextion consumer portal. No public number is known
to check its replies against.

## Links

The portal opens a delivery from its address with the shipment number and postcode (`orderno` and
`zip`) or with the tracking code (`uk`). The catalog cannot tell which of these a number is, so it
sends people to the delivery page.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
