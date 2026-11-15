# ITC Delivery

ITC Delivery parcels use enabled universal providers. There is no dedicated adapter.

ITC Delivery, of Islip, New York, has delivered and installed appliances on Long Island since
2000. Its tracker is its tenant on the DispatchTrack platform, which asks for the invoice or phone
number and the ZIP code, behind a reCAPTCHA check.

## Numbers

The home page's tracking box shows `ITC-`, nine digits and `-1` as its example, and adds that
prefix and suffix to nine bare digits. No public page shows a whole number, so there is no rule.

## Why there is no adapter

The tracker asks for a ZIP code and a reCAPTCHA token beside the number, and no public number is
known to check its replies against.

## Links

The home page's box opens `/track/?id=<number>`, but that page's widget does not read the
number, so the catalog sends people to the tracking page.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
