# Alpha Cargo

Alpha Cargo shipments use enabled universal providers. There is no dedicated adapter.

Alpha Cargo Solutions runs warehouses and business-to-business delivery by truck in Bangkok, for
Thai retailers and Chinese factories in Thailand.

## Numbers

Its tracking page takes a waybill number. No public page shows one, so there is no rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Links

`prod.alphacargo.io/en/tracking?waybill=<number>` (or `/th/` and `/zh/`) opens one waybill, and
the library reads the number from `waybill`. The host runs Alpha Cargo's delivery management
system, which it also offers to other logistics companies under their own domains; the rule
covers only this host.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
