# Miles Express

Miles Express parcels use enabled universal providers. There is no dedicated adapter.

Miles Express Cargo Systems Ltd of Marsa is a Maltese forwarder with air, road and sea freight,
warehousing and same-day and next-day distribution in Malta by truck, van and motorcycle. It is on
the Malta Communications Authority's register of postal service providers.

## Numbers

No public page shows a whole number or its layout, so there is no rule.

## Why there is no adapter

Its site's form opens the booking site's tracker (`booking.milesxp.com/tracking`, a Bizhandle white
label) with the number as `tracking_no`. The page shows the tracking id, the reference, the status,
origin and destination and the milestones; its script posts the numbers as `tracking_ids`, with the
page's CSRF token, to `/ajax/tracking/searchTrackings`. With no public number to check its replies
against, there is no adapter.

## Links

`booking.milesxp.com/tracking?tracking_no=<number>` opens one shipment; the former
`milesbooking.bizhandle.com` address redirects there.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
