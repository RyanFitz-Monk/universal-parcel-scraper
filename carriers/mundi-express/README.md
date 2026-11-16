# Mundi Express

Mundi Express parcels use enabled universal providers. There is no dedicated adapter.

Mundi Express is a Zaragoza courier for urban deliveries and dedicated direct runs, with its own
couriers. It belongs to the [GLS](../gls-es/README.md) network, and its national parcels are
tracked at GLS. Its IRIS tenant is named after the city.

## Numbers

No public page shows a Mundi Express number, so there is no rule.

## Why there is no adapter

The tracker is the company's tenant of the IRIS courier software on `zaragoza.factapp.es`. It
posts an ASP.NET form, so a number cannot go in the address. No public number is known to check
its replies against.

## Links

The company's site links the tracker over HTTP; the catalog uses its HTTPS address. The tracker
takes numbers only in its form.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
