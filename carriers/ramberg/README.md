# Ramberg

Ramberg parcels use enabled universal providers. There is no dedicated adapter.

Ramberg is a Norwegian freight carrier with its head office, terminal and warehouse in Sande near
Drammen and terminals at Langhus, Trondheim, Stavanger and Bergen. It carries general cargo and part
loads on fixed routes across Norway and offers cross-docking.

## Numbers

The tracker takes a waybill or parcel number. No public page shows a Ramberg number, so there is no
rule.

## Why there is no adapter

The tracking page's script posts the waybill or parcel number (`sendnummer`, `kollinummer`) to
`tracking.php` in the site's theme and gets JSON with the sender, recipient, events, estimated
delivery and proof of delivery. No public number is known to check its replies against.

## Links

The tracker takes numbers only in its form, so the catalog sends people to the tracking page.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
