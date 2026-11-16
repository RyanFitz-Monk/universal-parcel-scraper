# Toten Transport

Toten Transport parcels use enabled universal providers. There is no dedicated adapter.

Toten Transport is a Norwegian carrier based in Raufoss, with branches including Oslo and
Brumunddal, for groupage, part loads, express, forwarding and warehousing.

## Numbers

The tracker takes a GSIN, which starts with 70, or an SSCC, which starts with 00 or 37. Other
carriers use both GS1 identifiers too, so there is no rule.

## Why there is no adapter

The tracking page's script reads a shipment as JSON from `api.php`, with `type=gsin` or `type=sscc`
and the number. No public number is known to check its replies against.

## Links

`sporing.toten-transport.no/?gsin=<number>` opens one shipment. The page tells an SSCC from a GSIN
by its prefix, so the same link serves both.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
