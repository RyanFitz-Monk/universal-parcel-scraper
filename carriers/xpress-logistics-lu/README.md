# Xpress Logistics

Tracks Xpress Logistics parcels by parcel number.

Xpress Logistics, of Dudelange, is a Luxembourg courier for next-day express parcels across the
country, with drop-off depots by canton and industrial zone, storage and urgent freight. Its
tracker is a white-label page of the Conselio platform.

## How it works

`direct` reads the parcel from the service behind the tracking page,
`xpresslogistics.conselio.com/search/<number>`: no session, key or browser.

The reply's fields and statuses are taken from the tracking page's own script and template. A
parcel is a list of dated statuses. The status is the `provider_code` and the page's French
wording for it the description, in every language: the page has no other. A status the page
does not name is kept without a stage, and the stage is the newest named one.

Status clocks are read only with the offset the service states; a clock without one is rejected
instead of being given a zone.

The service is asked by the parcel's own address, and its reply names no number.

## Numbers

Its tracking page says a parcel number has nine digits, and asks for nothing shorter or longer.
Many carriers use nine-digit numbers, and no public page shows a whole one, so there is no rule:
Xpress Logistics is asked when it is selected.

## Limitations

The page does not say how the service writes a clock. A reply whose clocks carry no offset fails
as a changed service and the lookup goes on to the enabled universal providers.

The sender's name, which the page shows above the statuses, is not read.

A missing parcel is the service's empty HTTP 204. A 404 is read as a moved service, never as a
missing parcel.

## Links

Its tracker takes numbers only through its form, so no address opens one parcel.

## Testing

`npm run test:carriers:live -- carriers/xpress-logistics-lu`
