# Shree Nandan Courier

Shree Nandan Courier parcels use enabled universal providers. There is no dedicated adapter.

Shree Nandan Courier is a domestic courier network in India.

## Numbers

The tracking field on the home page accepts shipment numbers of eleven or thirteen digits.
Lookups archived from the carrier's tracker and a customer complaint show thirteen-digit
numbers. Digit runs of these lengths are printed by many other carriers, so no rule claims
them.

## Retrieval lead

The website is a single-page app. Its tracking page posts `con_no`, `purpose`,
`is_external_tracking` 1 and `client_id` 0 to
`api.connectingnandan.com/v1/website/tracking/web-view/consignment` three times, with `purpose`
1, 2 and 3, and merges the answers: the booking, the `traveling_info` history and the
`delivery_details`. Each key and value of the body is encrypted with AES-CBC after an HMAC of a
random value, the time and the value; the key, IV and HMAC secret are in the page's script for
every visitor, as are the `api-key`, `app-id` and `Platform` headers the requests carry. The
page shows a shipment for 180 days. For an older one the API answers HTTP 423 with a notice
naming the booking branch to contact. No found reply has been seen, so there is no adapter.

## Links

The current tracker opens results at an address holding an encrypted value instead of the
number, so no address opens one parcel. Lookups archived from the older tracker carry the
number as `cn` on `TrackingInfo.aspx`, and the carrier's Connecting Nandan platform shows it in
`/web-tracking/` addresses; the number is read from both.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
