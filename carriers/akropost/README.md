# Akropost

Akropost parcels use enabled universal providers. There is no dedicated adapter.

Akropost is a private postal operator in Bilbao for letters, registered letters, council and court
notifications, parcels and direct mail in the Basque Country, and in the rest of Spain through the
[Hispapost](../hispapost/README.md) network.

## Numbers

No public page shows an Akropost barcode, so there is no rule.

## Why there is no adapter

The tracker is Hispapost's tracking app with Akropost's logo, served from the same server: a form
posted with a session token, so a number cannot go in the address. No public Akropost barcode is
known to check its replies against.

## Leads

The [Hispapost adapter](../hispapost/README.md) reads the same app. With the host changed it
could serve Akropost once a known barcode shows the replies match.

## Links

The tracker takes numbers only in its form, so the catalog sends people to the tracking page.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
