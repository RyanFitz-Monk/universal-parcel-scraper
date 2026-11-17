# GK Global

GK Global parcels use enabled universal providers. There is no dedicated adapter.

GK Global's site, gkglobal.co.kr, offers its customers a warehouse management system, GK WMS, and a
public tracker for its deliveries in Korea.

## Numbers

Its tracker takes a waybill number of up to twenty digits, without hyphens. No public page shows
one, so there is no rule.

## Why there is no adapter

The tracker posts the number as `num` to `/invoice/tracking.php` and shows one of four stages:
order received, driver assigned and loading, out for delivery, delivered. No public number is
known to check its replies against.

## Links

The tracker answers only by POST, so no address opens one shipment.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
