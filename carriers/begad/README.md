# Begad Logistics

Begad Logistics parcels use enabled universal providers. There is no dedicated adapter.

Begad Logistics is the logistics service of Begad (بيجاد), an online marketplace in the United Arab
Emirates that delivers across the country. Its tracker at logistics.begad.ae shows a shipment's
status by the code the sender shares.

## Numbers

The tracker asks for codes starting `SHP-BGD`, for shipments Begad handles, or `SHP-EXT`, for
external ones. No public page shows a whole code, so there is no rule.

## Why there is no adapter

The tracker is a server-rendered page, and no public code is known to check its replies against.

## Links

The tracker's form sends the code in its `code` parameter, but codes are written with hyphens,
which the catalog drops from numbers, so the catalog sends people to the tracking page.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
