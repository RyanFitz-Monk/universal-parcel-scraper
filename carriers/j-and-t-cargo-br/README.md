# J&T Cargo Brasil

J&T Cargo Brasil parcels use enabled universal providers. There is no dedicated adapter.

J&T Cargo Brasil is J&T's network for heavier parcels and part loads in Brazil, separate from
[J&T Express Brazil](../j-and-t-br/README.md). Its site runs the same tracking software as
[J&T Cargo](../j-and-t-cargo/README.md) in Indonesia.

## Numbers

Its tracker takes waybill numbers of up to fifteen characters, or the shipper's order number. No
public page shows a J&T Cargo Brasil number, so there is no rule.

## Why there is no adapter

The tracker asks for the last four digits of the sender's or recipient's phone before it shows the
history. No public number is known to check its replies against.

## Links

`/networkQuery?waybillNo=<number>` opens one shipment, and the library reads the number from that
address.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
