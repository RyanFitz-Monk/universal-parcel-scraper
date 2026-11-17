# Isle of Man Post

Isle of Man Post parcels use enabled universal providers. There is no dedicated adapter.

Isle of Man Post is the island's national post, in Douglas. Its tracker follows items once they
reach the island, and its Local Tracked services.

## Numbers

Its tracker takes an item's barcode number, and sends items still with Royal Mail or
Parcelforce to those carriers' pages. No public page shows an Isle of Man Post number, so there
is no rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Links

`iompost.com/tools-services/track-your-mail?barcode=<number>` looks one item up, and the
library reads the number from `barcode`.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
