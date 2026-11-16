# GOLLOG

GOLLOG parcels use enabled universal providers. There is no dedicated adapter.

GOLLOG is the cargo and parcel service of GOL Linhas Aéreas, carried on GOL's flights and by road,
with drop-off stores across Brazil.

## Numbers

GOLLOG's help text says its tracking code is an eleven-digit number, also called the operational
number or AWB. Other airlines' air waybills share that shape and no public page shows a GOLLOG
number, so there is no rule. The tracker also takes an invoice with the CPF or CNPJ.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Links

`/app/site/tracking?code=<number>` fills the form and looks the number up, and the library reads the
number from that address.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
