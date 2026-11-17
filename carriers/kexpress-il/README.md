# K-Express

K-Express parcels use enabled universal providers. There is no dedicated adapter.

K-Express is an Israeli courier based in Haifa. It delivers parcels across the country and offers
pallet storage and picking. Its site is kexpress.co.il.

## Numbers

Its tracker takes a shipment number. No public page shows one, so there is no rule.

## Why there is no adapter

Its tracker is the same RunCom page as [Focus Logistics'](../focus-logistics-il/README.md): it asks
for a phone number beside the shipment number and sends both to `RunCom.Server/Request.aspx` with
the program `ship_locate_num_and_phone`. No public number is known to check its replies against.

## Links

The tracker needs the phone number too, so no address opens one shipment.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
