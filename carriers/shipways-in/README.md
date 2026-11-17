# ShipWays

ShipWays parcels use enabled universal providers. There is no dedicated adapter.

ShipWays, run by Shipways Supply Chain in Delhi, books international shipments from India for
businesses and online sellers with partner carriers and tracks them on its own page. Shipway
(shipway.com), an Indian tracking software company, is a different business.

## Numbers

Its tracker takes a ShipWays tracking number or order ID. No public page shows one, so there is no
rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Links

The tracker on `shipways.in/track` and `app.shipways.in/track` looks up the number in its `awb`,
`tracking` or `order` parameter on load, and its copy-link button gives `?awb=<number>`. The library
reads the number from those parameters.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
