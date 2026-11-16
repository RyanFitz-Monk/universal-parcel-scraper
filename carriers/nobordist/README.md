# Nobordist

Nobordist parcels use enabled universal providers. There is no dedicated adapter.

Nobordist is a São Paulo cross-border platform for parcels into and out of Brazil. It files customs
declarations, collects duties and hands parcels to first-mile, international and last-mile carriers.
Its orders carry a Nobordist number besides the partner carriers' numbers, and recipients follow it
on Nobordist's tracking page, trackmyorder.io.

## Numbers

No public page shows a Nobordist number, so there is no rule.

## Why there is no adapter

The tracking page sends a reCAPTCHA token with each lookup. No public number is known to check its
replies against.

## Links

`trackmyorder.io/trackings/<number>` and `trackmyorder.io/trackings?trackingNumber=<number>` open one
shipment, and the library reads the number from either address.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
