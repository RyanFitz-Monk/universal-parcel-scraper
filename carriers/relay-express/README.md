# Relay Express

Relay Express parcels use enabled universal providers. There is no dedicated adapter.

Relay Express, of Ahmedabad, carries cargo across India from more than 145 locations and runs
warehousing and distribution. Its site is relayexpress.in. Relay, the British delivery company, is a
different carrier.

## Numbers

Its tracker takes a docket number. No public page shows one, so there is no rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Leads

The tracker on `scm.relayexpress.in/DocketTrack` loads its answer by script, as an HTML fragment,
from `GET /CustomerDocketTrack/CustomerTrackkNew` with the number as `DocketNumber`. The request also
carries `Captcha` and `CaptchaHash` fields for an image CAPTCHA, which the page leaves empty because
it shows none.

## Links

The tracker reads no number from its address, so there are no tracking links.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
