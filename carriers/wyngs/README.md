# Wyngs

Wyngs parcels use enabled universal providers. There is no dedicated adapter.

Wyngs Sdn Bhd, of Shah Alam, Selangor, ships parcels abroad from Malaysia for individuals and small
businesses. Its site is wyngs-my.com.

## Numbers

Its tracking page takes a tracking ID. No public page shows one, so there is no rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Leads

The tracking page runs on Speedbox, a courier software platform, and looks the number up with
`GET https://wyngs-my.speedboxapp.com/prod/api/v2/tracking/track/single?shipmentNumber=<number>`.

## Links

The tracking page reads no number from its address, so there are no tracking links.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
