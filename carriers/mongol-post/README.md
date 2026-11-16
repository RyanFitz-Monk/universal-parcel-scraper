# Mongol Post

Mongol Post parcels use enabled universal providers. There is no dedicated adapter.

Mongol Post is Mongolia's national post. [Mongol Infinity Post](../mongol-infinity-post/README.md)
is a different company.

## Numbers

It gives international items UPU S10 numbers ending in `MN`. Generic postal detection handles these
numbers, so no rule for Mongol Post claims them.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Links

`mongolpost.mn/mn/track?trackingNumber=<number>` looks one number up, and the library reads the
number from that address.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
