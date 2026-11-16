# Pickit

Pickit parcels use enabled universal providers. There is no dedicated adapter.

Pickit runs a network of pickup points with home delivery and returns for online shops. It started
in Buenos Aires and has trackers for Chile, Colombia, Mexico, Peru and Uruguay as well.

## Numbers

No public page shows a Pickit number, so there is no rule.

## Why there is no adapter

The tracker sends an invisible reCAPTCHA token with each lookup. No public number is known to check
its tracker's replies against.

## Links

`tracking.pickit.com.ar/<number>` opens one shipment, and the library reads the number from that
address. The other countries' trackers are left alone, because the library builds addresses on the
Argentine one.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
