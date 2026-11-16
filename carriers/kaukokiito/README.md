# Kaukokiito

Kaukokiito parcels use enabled universal providers. There is no dedicated adapter.

Kaukokiito is a nationwide Finnish freight network with terminals across Finland. It carries
Kaukokiito Paketti parcels, general cargo, part and full loads and special transport, and offers
contract logistics.

## Numbers

The tracking page searches from its address only for six to twenty digits, a waybill number or a
parcel ID. Plain digits are shared with many carriers, so there is no rule.

## Why there is no adapter

The tracking page posts the number, its type and a nonce from the page to WordPress
`admin-ajax.php` with the action `kaukokiito_shipment_tracking_search`, and gets an HTML fragment
back. No public number is known to check its replies against.

## Links

The tracking page reads a number from its `query` parameter and searches on load with the type in
`type`. Without `type` it searches with an empty type, so the catalog's address asks for a waybill
number (`type=Cmr`), the form's default.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
