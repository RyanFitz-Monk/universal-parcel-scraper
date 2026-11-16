# Premo

Premo parcels use enabled universal providers. There is no dedicated adapter.

Premo, owned by Bonnier and Schibsted, delivers newspapers and e-commerce parcels in the early
morning across Greater Stockholm by electric vehicle, bike and on foot. Parcels for the rest of
Sweden go through [Early Bird](../early-bird/README.md) and are tracked there.

## Numbers

No public page shows a Premo number, so there is no rule.

## Why there is no adapter

The tracking page's form sends the number as `id` back to the same page, which shows the
shipment's events. No public number is known to check its replies against.

## Links

The tracking page reads a number from its `id` parameter.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
