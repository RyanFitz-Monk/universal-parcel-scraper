# Focus Logistics

Focus Logistics parcels use enabled universal providers. There is no dedicated adapter.

Focus Logistics (פוקוס לוגיסטיקה) is an Israeli courier delivering across the country. Its site is
focuslogistics.co.il.

## Numbers

Its tracker takes a shipment number. No public page shows one, so there is no rule.

## Why there is no adapter

Its tracker is a page of RunCom, the Run delivery software, and asks for a phone number beside the
shipment number. It sends both to `RunCom.Server/Request.aspx` with the program
`ship_locate_num_and_phone`. [K-Express](../kexpress-il/README.md) uses the same tracker. No public
number is known to check its replies against.

## Links

The tracker needs the phone number too, so no address opens one shipment.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
