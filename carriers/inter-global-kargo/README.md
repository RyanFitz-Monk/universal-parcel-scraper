# İnter Global Kargo

İnter Global Kargo parcels use enabled universal providers. There is no dedicated adapter.

İnter Global Kargo (IGC) is a Turkish parcel carrier founded in 1996, with its head office in
Güneşli, Istanbul. Its site is globalkargo.com.

## Numbers

The tracker takes a tracking number with a four-digit series that defaults to 0000, or an order
number. No public page shows an IGC number, so there is no rule.

## Why there is no adapter

The tracking form opens `/tr/KargoDetay/<number>/<series>`, a page the server renders. No public
number is known to check its replies against.

## Links

The catalog reads the number from `/tr/KargoDetay/<number>/<series>` on globalkargo.com.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
