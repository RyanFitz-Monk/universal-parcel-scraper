# J&T Cargo Brasil

J&T Cargo Brasil parcels use enabled universal providers. There is no dedicated adapter.

J&T Cargo Brasil is J&T's network for heavier parcels and part loads in Brazil, separate from
[J&T Express Brazil](../j-and-t-br/README.md). Its site runs the same tracking software as
[J&T Cargo](../j-and-t-cargo/README.md) in Indonesia.

## Numbers

Its [tracker](https://www.jtcargo.com.br/networkQuery) separates waybill numbers from the
shipper's order references. The waybill filters in both web layouts reject two letters followed
by ten digits. The order-reference mode accepts other text, so a reference accepted there is
not evidence of a waybill format.

Two letters and ten digits are used by [J&T Express Indonesia](../j-and-t/README.md),
[Aramex Australia](../aramex-au/README.md), [Aramex New Zealand](../aramex-nz/README.md) and,
in Brazil, [Onlog Express](../onlog-express/README.md), whose references are `AA` and ten digits.
That shared shape cannot identify Cargo Brasil. The site's other allowed formats come from
shared Cargo software; a public Brasil shipment must establish network ownership before a
number rule is added.

## Why there is no adapter

The published web flow asks for the last four digits of the sender's or recipient's phone before
it shows history. No confirmed public Brasil waybill is available to establish a history contract.

The [customer app](https://play.google.com/store/apps/details?id=com.jtcargo.bra.customer)
is separate from J&T Express Brazil's app. Its guest history call remains unverified.
[JTC Sprinter](https://play.google.com/store/apps/details?id=com.jtcargo.bra.out) is a staff app
that requires an authorized work account.

## Links

`/networkQuery?waybillNo=<number>` opens one shipment, and the library reads the number from that
address.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
