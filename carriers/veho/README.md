# Veho

Tracks Veho packages by tracking id or by the barcode on the sender's label.

Veho is a last-mile network in the United States that delivers e-commerce parcels for retailers
and shipping platforms. Its site is shipveho.com.

## How it works

The guest tracker at track.shipveho.com asks `getOrderByTrackingIdCWA` at
`https://esus.graph.shipveho.com/graphql`. The service takes a Firebase App Check token in the
authorization header, which the page obtains as it loads after an invisible reCAPTCHA
Enterprise check. The token lasts an hour and is bound to no number.

`browser` opens the tracker's home page in a private Chrome at `VEHO_BROWSER_WS_ENDPOINT`, and
`trawl` in the browser service; each keeps the token the page obtains. The page is given no
tracking number. `direct` then asks the order service over plain HTTP, and so does every lookup
while the token lasts; the adapter holds it in memory only. Lookups made together share one
browser read.

A plain request without a token is always refused, so the adapter offers no HTTP recognition:
a number is confirmed through the browser check, which needs dated history.

reCAPTCHA scores both the address and the browser. A datacenter address is refused, and so is
the browser service's Firefox even on a home address. A new Chrome profile on a home address can
pass, but after a burst of new profiles from that address reCAPTCHA refuses them, while an
established profile there still passes. The private Chrome opens a new profile for each read; it
is asked first and its failure to attest leaves `trawl` its turn. Veho serves
headless Chrome a stub page, so the private browser names itself as Chrome. Repeated reads lower
an address's score: the private browser reads at most every ten minutes, and one token covers
the hour, so a home address sees about one page load an hour while lookups go on.

With `VEHO_FALLBACK_PROXY_URL` set, a refusal on the browser service's own address is followed
by one read through that proxy. A path that was refused is left alone, so a refused lookup costs
no page load in that time: half an hour for the browser service and the proxy, six hours for the
private browser.

The query is the tracker's own without the recipient's address, the support case and the
delivery PIN. The operations, their labels and the sentence for each delivery issue come from
the tracker's script. Each event keeps its operation as `provider_code`, the tracker's label as
its description, its stated instant and the facility's city and state. A delivery issue the
driver met at the address is a failed attempt; one of the route or the package is an exception.
An operation the tracker does not name is kept as "Update received" without a stage.

The delivery window is given once the package has one, else the order's estimated or expected
day. A delay for which Veho names no new day withdraws the estimate.

## Numbers

A Veho tracking id is `VH` and twelve letters or digits, as its API documentation and tracker
describe; `veho-1` suggests Veho for it. The tracker also takes the barcode on a sender's label
and finds the package's tracking id: one public barcode, `VEHO`, a three-letter facility code
and nine digits, gives `veho-2`. Both stay low, as no public page shows a VH tracking id. Older
tracking ids have six characters and no rule.

A tracking id must be among the packages of the order the service returns. The reply does not
repeat a barcode: a barcode stands for the only package of its order, named in
`canonical_tracking_number`, and an order of several packages is inconclusive.

## Limitations

A missing number is the service's reply with a null order and no error. A refused token is
HTTP 401, or an unauthorized error beside a null order: it is a challenge, never a missing
parcel, and the token is dropped.

An attestation exchange that answers HTTP 429 reports a rate limit and carries the
server's Retry-After when supplied. Without a browser, a lookup ends as a challenge.

Collections from the recipient's address are not asked for; their operations carry no stage.

## Other routes

The [official recipient Android app](https://play.google.com/store/apps/details?id=com.veho.consumermobile)
calls `getOrderByTrackingId` on the same service. Its guest request builder uses native Firebase
App Check with Play Integrity, and signed-in requests add a Firebase Auth token. Its signing
certificate is published by the official Firebase project in
[asset links](https://veho-consumer-mobile.web.app/.well-known/assetlinks.json).

## Links

The tracker opens one package from `#/trackingid/<id>`, `#/barcode/<barcode>` or
`?trackingId=<id>`.

## Testing

`VEHO_BROWSER_WS_ENDPOINT=<private Chrome> npm run test:carriers:live -- carriers/veho`, or
`FLARESOLVERR_URL=<browser service>`. Each run loads the page once from that browser's address.
