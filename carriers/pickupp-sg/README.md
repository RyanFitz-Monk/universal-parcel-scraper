# Pickupp Singapore

Pickupp Singapore parcels use enabled universal providers. There is no dedicated adapter.

Pickupp Singapore is Pickupp's network in Singapore, with its own site, merchant portal and
order numbers. Hong Kong orders belong to `pickupp`.

## Numbers

A Pickupp Singapore order number is PU, twelve digits and SG. Archived lookups on the
Singapore tracker show it. `pickupp-sg-1` claims PU, twelve digits and SG; no other carrier
uses that layout.

## Links

`sg.pickupp.io/tracking/?orderNumber={number}`, the address archived lookups use, opens one
order; the language pages and the merchant portal's tracking page read the same parameter.

## Retrieval lead

The tracking page frames the merchant portal's public tracking page, which asks
`gateway.sg.pickupp.io/v2/public/backbone/order/?order_number={number}&source=MP` without a key.
The order comes back with its timeline (`old_order_timeline`) and waypoints. An unknown order
answers HTTP 400 with error type `020023`, "Order ID not found". The public samples are no longer
found, so there is no adapter until a found reply shows the timeline's fields.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
