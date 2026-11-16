# Cargo X

Cargo X parcels use enabled universal providers. There is no dedicated adapter.

Cargo X is an e-commerce parcel carrier based in Esenler, Istanbul, with branches across Turkey.
Its licence was issued to Scotty Kargo A.Ş., the company's former name; parcels from the earlier
Scotty courier are tracked at [Kargoist](../kargoist/README.md), so that name is not an alias here.

## Numbers

The tracker takes the shop's shipment number. No public page shows a whole Cargo X number, so
there is no rule.

## Why there is no adapter

The tracking form opens `t.cargox.com.tr/getlink.php?barcode=<number>`, which leads to the
shipment's page on Cargo X's tracking panel. No public number is known to check its replies
against.

## Links

The catalog reads the number from `barcode` on `t.cargox.com.tr/getlink.php`.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
