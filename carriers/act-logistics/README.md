# ACT Logistics

ACT Logistics parcels use enabled universal providers. There is no dedicated adapter.

ACT Logistics is a South African courier and road freight carrier with its head office in Cape
Town, branches in Johannesburg, Gqeberha and Durban, and subsidiary branches across the country. It
also sends documents and parcels abroad and runs cross-border road freight to neighbouring
countries. Its site is act-logistics.co.za.

## Numbers

Its tracker takes a waybill number. No public page shows one, so there is no rule.

## Why there is no adapter

Its tracker is the same ParcelPerfect app as
[Intertown Transport's](../intertown-transport/README.md): it keeps the searched waybill in the
browser's storage and posts it as JSON to `trackappservice/Json/index.php` with class `Waybill` and
method `getEventData`. No public number is known to check its replies against.

## Links

The app takes the waybill in its form and keeps it in the browser, so no address opens one parcel.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
