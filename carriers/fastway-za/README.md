# Fastway South Africa

Fastway South Africa parcels use enabled universal providers. There is no dedicated adapter.

Fastway South Africa is a franchise courier network, the South African master franchise of Fastway.
It still trades as Fastway, while Fastway in Australia and New Zealand now trades as Aramex, and it
runs its own tracker.

## Numbers

Its tracker takes a label number of up to 25 characters. No public page shows a Fastway South Africa
number, so there is no rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Links

`fastway.co.za/our-services/track-your-parcel/?l=<number>` looks one number up, as does the home
page's form at `/tools/track?l=<number>`, and the library reads the number from either address.
Without a number the second address answers with a server error, so the health check reads the
first.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
