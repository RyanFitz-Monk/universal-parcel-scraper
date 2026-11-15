# TSB

Tracks TSB shipments by tracking number.

TSB is a Spanish business-to-business network for industrial parcels, run by
Transdina Cargo, with international services across Europe. Its site is tsbtrans.com and its
shipment tracker is on tsbconnect.net.

## How it works

`direct` reads the shipment from the service behind the public tracker,
`www.tsbconnect.net/tracking/find?number=<number>`: no session, token or browser.

The reply's fields, steps and situations are taken from the tracker's own script and its
Spanish, English and Catalan translations. The public page shows a rail of dated steps: created,
received, departed, arrived, out for delivery and delivered. Each dated step is an event, with
the step's name as `provider_code` and the page's wording as description. A delivery round that
failed is its own event, worded as the tracker words a failed delivery. An international
departure is an event too, and renames the arrival step as the page does.

A shipment can state its situation, one of the codes the script translates. A stated situation
decides the stage, since it tells a return, a cancellation or a shortage that the rail cannot.
Without one, the newest step decides. A partial and a deferred delivery leave goods to come and
stay in transit.

Dates are moments in milliseconds, as the page reads them. Wordings are Catalan or English for
a reader of those languages, and Spanish, the tracker's own default, for everyone else.

The service repeats the number it was asked, and the reply must repeat the requested one. A
shipment without that echo must carry the number as its own or as its customer reference.

## Numbers

No public page shows one of its shipment numbers, so there is no rule: TSB is asked when it is
selected or when a tracking link names it.

## Limitations

The sender's and recipient's names and addresses, the customer reference, the remarks, the
platforms' contact details, the delivery position and the proof of delivery are never read,
though the public page shows them.

The other events of a shipment are not read: the public page does not show them.

A missing shipment is the service's `tracking.notFound` for the requested number. An HTTP 404
is read as a moved service, never as a missing shipment.

## Links

`www.tsbconnect.net/app/tracking/public/tracking/<number>` opens one shipment. The library
reads the number from that address.

## Testing

`npm run test:carriers:live -- carriers/tsb-es`
