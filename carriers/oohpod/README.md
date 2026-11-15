# OOHPod

OOHPod parcels use enabled universal providers. There is no dedicated adapter.

OOHPod Ltd of Dublin runs a network of self-service parcel lockers in Ireland and Northern Ireland and
sells locker-to-locker, locker-to-door and leave-to-collect shipments. UPS carries the parcels
between lockers and to doors; a shipment UPS carries end to end shows the sender a UPS number, so
OOHPod's own numbers cover its locker shipments.

## Numbers

No public page shows a whole number or its layout, so there is no rule.

## Why there is no adapter

The tracker at `shipping.oohpod.com/tracking` is a single-page app with one field. Its script asks
`/api-lms/Parcel/status` with the number as `trackingNumber` and shows the shipment's timeline. With
no public number to check its replies against, there is no adapter.

## Links

The tracker looks numbers up in place, so no address opens one shipment.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
