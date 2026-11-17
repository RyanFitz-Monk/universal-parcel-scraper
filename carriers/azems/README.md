# Azer Express Post

Azer Express Post parcels use enabled universal providers. There is no dedicated adapter.

Azer Express Post (Azərekspresspoçt, AZEMS) is Azerbaijan's EMS operator, a company separate from
[Azerpost](../azerpost/README.md). It carries international and domestic EMS items and same-day
courier deliveries.

## Numbers

No public page shows an AZEMS number, so there is no rule.

## Why there is no adapter

Its website puts F5's JavaScript bot check before its pages, which a browser passes by itself. No
public number is known to check its tracker's replies against.

## Leads

The tracking page posts `package_id` and `lang_code` as form data to `/api/get-package` on its own
host. The site also serves `/api/get-csrf`.

## Links

`azems.az/az/gonderis-izle?package_id=<number>` looks one number up (also `/en/track-shipment` and
`/ru/otsledit-posylku`), and the library reads the number from those addresses.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
