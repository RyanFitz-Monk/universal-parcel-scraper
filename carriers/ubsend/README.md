# UBsend

UBsend parcels use enabled universal providers. There is no dedicated adapter.

UBsend is a Danish parcel company in Aarhus that sells domestic and cross-border delivery for web
shops over a network of local carriers, with offices in Amsterdam, Berlin, Copenhagen and Milan.

## Numbers

Its tracker searches by the parcel's reference, often the local carrier's number, or by order
number. Those numbers belong to other carriers, so there is no rule.

## Why there is no adapter

The tracker's script searches shipments through UBsend's API, by carrier reference and an optional
postcode, with a key from the app's settings. No public number is known to check its replies
against.

## Links

`ui.ubsend.io/track-and-trace?search=<number>` opens a search for one parcel.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
