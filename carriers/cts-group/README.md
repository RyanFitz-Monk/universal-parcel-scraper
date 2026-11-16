# CTS Group

CTS Group parcels use enabled universal providers. There is no dedicated adapter.

CTS Group is a distribution company in Nieuw-Vennep for groupage, parcel and e-commerce deliveries
across Europe.

## Numbers

Its tracking code joins the CTS file number, the delivery postcode and the order reference with
hyphens; hyphens inside a postcode or reference become underscores. Such a code is not a tracking
number on its own, so there is no rule.

## Why there is no adapter

The tracking page's script reads the code from `japi.ctsgroup.nl/ctskwapi/track/<code>`. No public
code is known to check its replies against.

## Links

`/track-trace/?t=<code>` opens a shipment, but the code holds hyphens and a postcode, so the
catalog sends people to the tracking page.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
