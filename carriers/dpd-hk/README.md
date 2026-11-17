# DPD Hong Kong

DPD Hong Kong parcels use enabled universal providers. There is no dedicated adapter.

DPD Hong Kong is the DPD network's Hong Kong operation, run by Lenton Group, for international
express, time-critical shipments and e-commerce logistics.

## Numbers

Its tracker takes up to forty numbers, one per line, and has a tab for customer references. No
public page shows a number, so there is no rule.

## Why there is no adapter

No public number is known to check its tracker's replies against. The tracker is the app and
backend [RPX Online](../rpx-hk/README.md) uses, which Lenton Group also runs for its other
operations; access to that backend does not establish which operation owns a shipment.

## Links

`tracking.dpd.hk/?trackNo=<number>` opens the tracker and searches; its script also reads
`trackingNumber`. DPD's Hong Kong site links `tracking.dpd.hk/#/?trackNo=<number>`. The library
reads the number from all three.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
