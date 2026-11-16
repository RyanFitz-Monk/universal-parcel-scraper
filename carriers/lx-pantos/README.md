# LX Pantos

LX Pantos parcels use enabled universal providers. There is no dedicated adapter.

LX Pantos (LX판토스, formerly 범한판토스) is the LX group's logistics company in Seoul: an international
forwarder and contract logistics firm that also ships cross-border e-commerce parcels.

## Numbers

The tracker takes its express numbers and house or master bills of lading, up to 30 at once. Its
example is PKR and nine digits, but no public page shows a real number, so there is no rule.

## Why there is no adapter

The tracking page reads shipments without a login: it posts the numbers to
`/eCommerce/action/portal.TrackingPopup.retreiveTrackingList`, then asks for each shipment's
detail. No public number is known to check its replies against.

## Links

The e-commerce portal's tracking box opens the tracking page with the number in `quickNo`, and the
page searches on load; the catalog reads the number from `quickNo`.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
