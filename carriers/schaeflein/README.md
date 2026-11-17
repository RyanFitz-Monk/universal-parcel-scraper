# Schäflein

Schäflein parcels use enabled universal providers. There is no dedicated adapter.

Schäflein AG, of Röthlein, runs transport, contract, e-commerce and aftermarket logistics. Its
tracker runs on Cepra, the system of the [CargoLine](../cargoline/README.md) network.

## Numbers

A colli number is `00` and an SSCC, which every GS1 shipper prints, so no rule names it. The
tracker also takes a company number with a shipment number.

## Why there is no adapter

A found parcel shows its details only after the recipient's postcode, which no public source gives
beside a number.

## Links

`my.schaeflein.de/Track/<colli number>` opens one parcel, and the library reads the number from
that address.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
