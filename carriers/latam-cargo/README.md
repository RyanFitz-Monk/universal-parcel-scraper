# LATAM Cargo

LATAM Cargo parcels use enabled universal providers. There is no dedicated adapter.

LATAM Cargo is the cargo arm of LATAM Airlines Group, based in Santiago, with freighters and the holds
of passenger flights across South America and to North America and Europe. In Brazil it also carries
domestic courier and e-commerce shipments under service orders.

## Numbers

Its tracker takes an air waybill as a three-digit airline prefix and a number of up to eight digits,
or a Brazilian domestic service order. Other airlines' air waybills share that shape and no public
page shows a LATAM Cargo number, so there is no rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Links

The tracking page fills its form from `docPrefix`, `docNumber` and `soType` in its address. A link
needs the waybill split into its prefix and serial, so the catalog sends people to the tracking page.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
