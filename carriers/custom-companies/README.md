# The Custom Companies

The Custom Companies shipments use the carrier's shipment details page through the host's
supplied transport.

The Custom Companies is a less-than-truckload and truckload carrier based in Chicago and Los
Angeles. Carrier Logistics runs its tracking pages.

## Numbers

The details page and its archived lookups show eight-digit shipment numbers. Some histories
name interline partners for the final leg. Bare eight-digit runs are other carriers' numbers
too, so no rule claims them and a gap declaration covers the layout.

## Links

`api.customco.com/shipmenttrace.htm?referencenumber={number}` is what the home page's tracking
box opens. Lookups on `api.customco.com/scripts/cgiip.exe/boldetail.htm` carry the shipment
number in `wpro1`.

## Retrieval

The adapter reads `GET api.customco.com/scripts/cgiip.exe/boldetail.htm?wbtn=PRO&wpro1={number}`,
the details page, with no key, token or sign-in. The page must name the whole number asked as
its shipment number. The newer `shipmenttrace.htm` page lists shipments by a date window, so
older shipments are missing from it; the details page still shows them.

The history is read with its codes, towns and wall clocks. The times are each terminal's own: a
California terminal's departure reads two hours before the same scan on Central time. A place
column holding a note such as "On Local Delivery Truck" is not kept as a location. The delivery
settles the shipment even when a terminal scans the freight again after it; the page lists the
delivery first for that reason. A freight class correction and a delivery appointment move
nothing.

"Please Enter a Valid BOL Number." is a missing shipment. A blocked or changed page stays a
failure. Who signed, the references, the addresses and the freight details are not read.

`api.customco.com` does not answer connections from Europe, while `www.customco.com` does.
Configure US egress in the host's supplied fetcher. The adapter does not own proxy credentials
or route unrelated providers through that connection. The Custom Companies publishes no tracking
app.

## Limitations

- Every public sample is a delivered shipment, so the page of a shipment still on its way, and
  any estimate it shows, have not been seen.
- Wall clocks only; no scan carries an offset.

## Testing

Set private `CUSTOM_COMPANIES_TRACKING_NUMBER` and `CUSTOM_COMPANIES_PROXY_URL`, then run
`npm run test:carriers:live -- carriers/custom-companies/adapter.live.test.ts`.
