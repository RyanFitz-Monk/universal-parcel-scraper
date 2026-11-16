# Interfjord

Interfjord parcels use enabled universal providers. There is no dedicated adapter.

Interfjord is a partner-owned Danish forwarder based in Glyngøre, with offices across Denmark, in
Stavanger and in Kraków. It moves road, courier, air and sea freight.

## Numbers

The tracker takes an order number, shipment number, reference or air waybill. No public page shows
an Interfjord number, so there is no rule.

## Why there is no adapter

The tracker is a plain form that sends the number as `track` back to `tracking.interfjord.dk`. No
public number is known to check its replies against.

## Links

The site's Tracking link opens the tracker, which reads a number from its `track` parameter.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
