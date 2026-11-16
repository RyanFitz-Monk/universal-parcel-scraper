# Yongma Logis

Yongma Logis parcels use enabled universal providers. There is no dedicated adapter.

Yongma Logis (용마로지스) is the Dong-A Socio Group's logistics company, based in Gimpo. It runs
pharmaceutical and consumer-goods logistics with its own delivery centres and delivers parcels between
businesses.

## Numbers

The tracker takes a waybill number of digits only. No public page shows a Yongma Logis number, so
there is no rule.

## Why there is no adapter

The tracking page loads the shipment from the site's own task service after it opens. No public
number is known to check its replies against.

## Links

The home page's waybill box opens `ylis.yongmalogis.co.kr/cmm/modalDeliveryCargoTrace.do?ordno=<number>`;
the catalog reads the number from `ordno`.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
