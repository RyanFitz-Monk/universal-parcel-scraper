# Qiantong Logistics

Qiantong Logistics shipments use enabled universal providers. There is no dedicated adapter.

Qiantong Logistics (香港乾通物流) of Tsim Sha Tsui, Hong Kong, carries goods both ways between
Hong Kong and mainland China, with warehousing and customs clearance.

## Numbers

The tracking box on its home page and its tracking page take waybill numbers, several at once.
No public page shows one, so there is no rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Leads

The tracking page reads `chintongex.com/api/mer/goodsInfo/trackingNumber` with the numbers in
`trackingNumber`.

## Links

The site keeps its pages in the address fragment. `chintongex.com/#/track?number=<number>` opens
the tracking page and searches, and the library reads the number from the fragment. The same
path without the fragment answers 404.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
