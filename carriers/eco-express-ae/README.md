# Eco Express

Eco Express parcels use enabled universal providers. There is no dedicated adapter.

## Numbers

Eco Express is a UAE courier for domestic, international and e-commerce deliveries, the courier
arm of the ECO Freight group, whose name providers also give it. Archived
lookups on its tracker hold shipment numbers of the letters `ECO` and ten digits. OCASA in
Argentina prints the same layout, so no rule claims it and the gap is declared.

## Retrieval lead

The tracking page sends the number as `number` to its October CMS `onTracking` handler on
`app.ecofreight.ae/en/tracking`, asking for the `trackingwidget` partial, and the reply is that
partial's HTML inside JSON. `/en/tracking/{number}` fills the field and makes the same request. A
number it does not show leaves only the prompt "Type your full tracking number to get the tracking
data." No found reply has been seen, so there is no adapter.

## Links

The tracker opens one parcel at `app.ecofreight.ae/en/tracking/{number}`, the address the
archived lookups use.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
