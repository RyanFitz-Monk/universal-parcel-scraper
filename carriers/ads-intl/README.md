# ADS International

ADS International parcels use enabled universal providers. There is no dedicated adapter.

ADS International Express Sdn Bhd, of Subang Jaya, Selangor, is a Malaysian freight forwarder,
customs broker and express courier. Its site is ads-intl.com.

## Numbers

Its tracker takes an ADS waybill number, another carrier's waybill number or a customer reference,
chosen from a list. No public page shows an ADS waybill number, so there is no rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Leads

The tracker's script looks the number up with
`GET https://ads-intl.com/wp-json/ads/v1/tracking?type=<type>&number=<number>`, where `type` is
`waybill`, `carrier` or `reference`.

## Links

`ads-intl.com/track-shipment/?type=waybill&number=<number>` looks an ADS waybill up on load. The
library reads the number from `number` only when `type` is `waybill`, because the other types carry
another carrier's number or a customer's reference.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
