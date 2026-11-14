# HRX

Tracks HRX E-com Parcel orders: delivery to lockers, pickup points and doors across the EU,
often by local partners.

HRX is a Finnish and Baltic road express group with companies in Finland, Estonia, Latvia,
Lithuania, Poland and Sweden. Its sites are hrx.eu and the country sites, hrx.lv among them.
Its road freight has a separate tracker, a posted form, which this adapter does not read.

## How it works

`direct` asks the service behind the E-com Parcel tracking page on wop.hrx.eu,
`/api/v1/public/orders/{number}`, with one plain GET: no session, token or browser.

The reply's fields and event names are taken from the tracking page's own source, which
declares the reply and translates each event name. The order must name the whole requested
number. Each event keeps its name as `provider_code`, the page's English wording as its
description, and its place. A name the page does not list is kept without a stage.

Event clocks are read only with the offset the service states; a clock without one is
rejected instead of being given a zone.

The destination country and the weight are read from the order. Its delivery address and
dimensions are left out: for a door delivery the address is the recipient's.

## Numbers

No public parcel number has been found; HRX's plugins' documentation shows only
placeholders. There is no rule, so HRX is asked when it is selected or when a tracking
link names it.

## Limitations

A missing order is the service's HTTP 404 with `not_found`. The site answers a path it does
not serve with its application page, which is read as a changed service, never as a missing
parcel.

`other` is an event HRX could not read from its partner; it carries no stage.

## Links

The E-com Parcel tracker's address carries the number in its path.

## Testing

`npm run test:carriers:live -- carriers/hrx`
