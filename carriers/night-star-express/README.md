# Night Star Express

Night Star Express parcels use enabled universal providers. There is no dedicated adapter.

Night Star Express, Night Star Express GmbH Logistik of Unna, runs a German overnight delivery
network with partner companies: spare parts and other business goods delivered by early morning,
also without a signature into depots and service vehicles, and abroad through partners. Its
tracker is a white-label 1stSCAN page on its own host, customer.night-star-express.de, which shows
each package's scans and the electronic proof of delivery.

## Numbers

Its tracker takes one reference of six characters or more, or up to five separated by commas. No
public page shows a whole number or its layout, so there is no rule.

## Why there is no adapter

The tracker is a script page that asks the platform's JSON service for the scans. With no public
number to check its replies against, there is no adapter.

## Leads

The tracker's script posts the references to `/api/orders` as `searches`, each with an optional
recipient postcode as `verifyingZip`.

The service needs no session and answers an unknown reference with HTTP 404 and `Not found`. A
found order lists its packages as `colis`, each with a status name and its steps, and shows
the recipient's address only once the postcode verifies the package. The script translates the
status names and comes without a source map.

## Links

`https://customer.night-star-express.de/tracking/{trackingNumber}` opens the tracker on the
number. The library reads the number from that address, the first one when commas join several.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
