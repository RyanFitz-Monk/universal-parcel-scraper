# swissconnect

Tracks swissconnect courier shipments by their shipment number.

swissconnect, swissconnect ag of Lucerne, runs a network of more than 80 Swiss express courier
firms. Its member firms carry shipments by bicycle, train and car, and its own software routes
them.

## How it works

`direct` posts the number to the service behind the tracker's pop-up form on swissconnect.ch,
`/api/track-shipment`, as `trackingId`: no session, token or browser.

The reply's fields and states are taken from the tracker's own script and the wordings from its
German page. The shipment must name the whole requested number. The tracker shows a bar of four
steps, in preparation, picked up, out for delivery and delivered, and the last step reached is
the shipment's status; a cancelled shipment shows `annullated` in their place.

There is no scan list. The pickup and the delivery become events once their steps are reached,
each with the time the service gives it. Before delivery, the planned delivery is the estimate:
the day with its window when the service gives one, else the time it is due by.

An event's clock is read only with the zone or offset the service states beside it; one without
is rejected instead of being given a zone. The planned delivery keeps its wall clock as written.

A number reaches the adapter without its hyphen. One the service does not find that way, of the
layout the form's placeholder writes, is asked once more with the hyphen restored.

The pickup and delivery addresses and the name of whoever took the shipment are left out.

## Numbers

The form's placeholder reads as three digits, a hyphen, a digit, a letter and five digits, but
no public page shows a real number, so there is no rule: swissconnect is asked when it is
selected.

## Limitations

A missing shipment is the service's `tracking.error.noresult`. A number that several shipments
share gets an error asking the reader to call swissconnect; it is reported as unconfirmed, not
as missing.

## Links

Its tracker takes numbers only through its pop-up form, so no address opens one shipment.

## Testing

`npm run test:carriers:live -- carriers/swissconnect`
