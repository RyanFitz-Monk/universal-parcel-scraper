# Kakao T Same-Day Delivery

Kakao T Same-Day Delivery parcels use enabled universal providers. There is no dedicated adapter.

Kakao T Same-Day Delivery (카카오 T 당일배송) is Kakao Mobility's same-day parcel service for online
sellers in Korea. Kakao Mobility took over 오늘의픽업 (Today Pickup), the company that started it, in
2022.

## Numbers

The tracker asks for a 12-digit waybill. No public page shows one of its numbers, and Korean
couriers share that shape, so there is no rule.

## Why there is no adapter

The tracker is a server page; the form sends the number in the path. No public number is known to
check its replies against.

## Links

The tracker opens `/front/delivery/list/<number>` on `todaypickup-partners.kakaomobility.com`; the
catalog reads the number from that path.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
