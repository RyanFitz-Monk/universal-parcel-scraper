# Kurly Next Mile

Kurly Next Mile parcels use enabled universal providers. There is no dedicated adapter.

Kurly Next Mile (컬리넥스트마일) is Kurly's logistics company in Seoul. It runs Market Kurly's
overnight dawn deliveries and carries parcels and chilled goods for other shippers.

## Numbers

The tracker takes up to two waybill numbers and keeps three months of history. No public page
shows a Kurly Next Mile number, so there is no rule.

## Why there is no adapter

The tracking page reads a waybill from `dos-app-api.kurly.com/la-tms/tracker/nextmile/<number>`.
No public number is known to check its replies against.

## Links

The tracking page reads a number from its `invoice_no` parameter and looks it up on load.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
