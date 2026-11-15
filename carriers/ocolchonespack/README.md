# Ocolchonespack

Ocolchonespack parcels use enabled universal providers. There is no dedicated adapter.

Ocolchonespack (Logística OcoPack) is the parcel service of Oco Mayoristas México, S.A. de C.V., a
mattress wholesaler in Guadalupe, Zacatecas. It delivers with its own fleet and partner carriers,
and its public tracker finds a shipment by guide or by sale reference.

## Numbers

No public page shows an Ocolchonespack guide, so there is no rule.

## Why there is no adapter

The tracker's script checks a guide with `server-side/get-data-guia.php?guia=`, or a sale with
`server-side/venta.php?referencia=`, before it opens the result. No public guide is known to check
its replies against.

## Links

The tracker opens a guide at `guia.php?<guide>`, with the guide as the whole query.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
