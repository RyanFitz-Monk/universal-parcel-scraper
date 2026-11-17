# deleo

deleo parcels use enabled universal providers. There is no dedicated adapter.

deleo (델레오) is a Korean cross-border e-commerce logistics company. Its tracker shows a shipment
under deleo's own number, with the number of the parcel's inbound leg and the carrier and number
of its last mile. Its site is deleo.co.kr.

## Numbers

Its tracker accepts `D` or `K` and fourteen digits, or `DL` and fourteen digits after up to two
digits, and refuses other input before asking its server. No public page shows one, so there is
no rule.

## Why there is no adapter

The tracker loads the shipment as HTML fragments from `/tracking/<number>` and
`/tracking/trace/<number>`. No public number is known to check its replies against.

## Links

`tracking.deleo.co.kr/?trackingNo=<number>` opens one shipment, and the library reads the number
from `trackingNo`.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
