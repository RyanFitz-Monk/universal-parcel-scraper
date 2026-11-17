# Szendex

Szendex parcels use enabled universal providers. There is no dedicated adapter.

Szendex, S.L., of Granollers near Barcelona, is a Spanish courier for same-day and next-day
deliveries, healthcare shipments and logistics in Spain and Europe.

## Numbers

Its tracker takes a shipment number of up to 30 characters. No public page shows one, so there is
no rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Leads

The tracking page on `www.szendex.com/seguimiento` reads
`GET https://www.szendex.com/api/tracking/<number>` and sends visitors on to the tracker on
`erp.szendex.com`.

## Links

`erp.szendex.com/DlWebTrackingVWE/?seg=<number>` opens one shipment on the tracker, and the
library reads the number from `seg`.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
