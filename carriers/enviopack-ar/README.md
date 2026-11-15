# Envíopack Argentina

Envíopack Argentina parcels use enabled universal providers. There is no dedicated adapter.

Envíopack is an Argentine logistics operator: fulfilment, last-mile delivery including bulky goods,
B2B distribution and same-day service, with software that links shops to couriers. It gives each
shipment its own number, and its tracker names the courier that delivers when a partner does.
Its Mexican operation has its own tracker (`enviopack-mx`).

## Numbers

No public page shows an Envíopack number, so there is no rule.

## Why there is no adapter

The tracker's script reads `GET api.enviopack.com/tracking/<number>`. No public number is known to
check its replies against.

## Links

The tracker takes the number as its path, so `tracking.enviopack.com.ar/<number>` opens one
shipment.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
