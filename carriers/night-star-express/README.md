# Night Star Express

Tracks Night Star Express shipments and their packages by shipment number or package barcode.

Night Star Express, Night Star Express GmbH Logistik of Unna, runs a German overnight delivery
network with partner companies: spare parts and other business goods delivered by early morning,
also without a signature into depots and service vehicles, and abroad through partners. Its
tracker is a white-label 1stSCAN page on its own host, customer.night-star-express.de.

## How it works

`direct` posts the number to the service behind the tracker, `/api/orders`, as one of its
`searches`: no session, token or browser.

The reply's fields and status names are taken from the tracker's own script, which reads the
reply and translates each status name. A reply must name the whole requested number: a package's
barcode reads that package, the shipment's number reads every package of it. Each event keeps
its status name as `provider_code` and the service's own wording, with its remark, as its
description. A name the script does not list is kept without a stage.

A package's own status decides its stage. A shipment of several packages is delivered once each
one is; until then it stands where the undelivered package with the newest scan does.

The service words its scans in the language asked for: German for a German reader, English for
everyone else.

Event clocks are read only with the offset the service states; a clock without one is rejected
instead of being given a zone.

The service level is read as the service name when every package shares it.

## Numbers

The tracker takes one reference of six characters or more, or up to five separated by commas.
No public page shows a whole number or its layout, so there is no rule: Night Star Express is
asked when it is selected or when a tracking link names it.

## Limitations

The recipient's postcode unlocks the addresses, weight, dimensions, scan positions, signatory
and proof of delivery on the tracker. The adapter never sends one and reads none of them.

A missing reference is the service's HTTP 404 with `Not found`, or an empty list. Any other 404
is read as a moved service, never as a missing parcel.

A failed or late pickup leaves the package registered with its sender, and a late delivery
leaves it in transit.

## Links

`https://customer.night-star-express.de/tracking/{trackingNumber}` opens the tracker on the
number. The library reads the number from that address, the first one when commas join several.

## Testing

`npm run test:carriers:live -- carriers/night-star-express`
