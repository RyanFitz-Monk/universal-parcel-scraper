# Airways Courier

Airways Courier parcels use enabled universal providers. There is no dedicated adapter.

Airways Courier (I) Pvt. Ltd. is a Bengaluru courier, founded in 1994, that delivers documents and
parcels across India through a network of franchised offices. Its site is airwayscourier.co.in.

## Numbers

Its tracking form takes a waybill or a reference number. No public page shows one, so there is no
rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Links

The tracking form opens from the track button in the page header. It loads
`airwayscourier.co.in/Tracking_new.aspx?awb_no=<number>&type=w` for a waybill and `type=r` for a
reference, and the library reads the number from `awb_no` only when `type` is `w`.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
