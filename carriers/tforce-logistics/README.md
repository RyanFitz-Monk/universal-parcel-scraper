# TForce Logistics

TForce Logistics packages use the carrier's public tracker through the host's supplied
transport.

TForce Logistics is TFI International's final-mile network in the United States and Canada,
formerly Dynamex and then TForce Final Mile. It is separate from TForce Freight, TFI's
less-than-truckload carrier, which has its own entry.

## Numbers

The tracker takes an order number, reference or package ID. TForce's own labels carry `TF` and
twelve, thirteen or eighteen digits, which `tforce-logistics-1` claims; no other carrier's
numbers or rules use that shape. Most packages keep the retailer's own ID instead: twenty or
twelve digits, or letters naming the shipper such as `WCA`, `WM00AK` or `BBYC`. Archived
lookups on the tracker show both kinds, but the retailer IDs name the shipper rather than the
carrier, and the numeric ones share their shape with many carriers, so no rule claims them.

## Links

The tracking form on `tforcelogistics.com` opens
`direct.tfesg.com/finalmiletrack/Track?trackingNumber={number}&brand=0`. Archived lookups also
use `trackingNumber` on the tracker's older `track/externalTracking.jsp` page; the library reads
the number from either address.

## Retrieval

The adapter reads `GET direct.tfesg.com/finalmiletrack/Track?trackingNumber={number}&brand=0`,
the tracker's server-rendered page, with no key, token or sign-in. The tracker matches the whole
number, piece suffix such as `-1` included, so the number is sent as written. The page must name
the number asked and exactly one package: an order number or reference can match several, and
one of them is no answer for the rest. "No shipments found that match Tracking Number" is a
missing package when it names the number asked. The tracker only looks back 120 days, so an
older package reads as missing too; some old numbers get an empty panel instead, which stays
indeterminate. The tracker fails with HTTP 500 on a request without `Accept-Language`, so the
adapter sends one.

Each scan's time carries a North American zone abbreviation, which gives its offset, but no
year: the year is the one that puts the scan no later than a day after the lookup. Places keep
their town and province or state; their postal codes are dropped. Rows labelled "Status" or
"Delivered To" hold a value for the row above them, such as a return's reason or where the
package was left, and are not events. The "Expected By" estimate is not read, nor are the
origin, destination, pieces and weight.

The tracker's Sucuri firewall refuses whole countries with HTTP 403: Germany, Switzerland, the
Netherlands, Italy, Japan, Australia and Brazil among others, while the United States, Canada
and the United Kingdom get through. That refusal is a challenge, not a missing package.
Configure US or Canadian egress in the host's supplied fetcher. The adapter does not own proxy
credentials or route unrelated providers through that connection. TForce's only app is an
iPhone app for its operations and business customers.

## Limitations

- A delivered package's page has not been seen live, so its rows follow the archived lookups.
- Only one package per number is read.

## Testing

Set private `TFORCE_LOGISTICS_TRACKING_NUMBER` and `TFORCE_LOGISTICS_PROXY_URL`, then run
`npm run test:carriers:live -- carriers/tforce-logistics/adapter.live.test.ts`.
