# SGXpress

SGXpress parcels use enabled universal providers. There is no dedicated adapter.

SGXpress of Adachi, Tokyo ships cross-border e-commerce parcels from its own warehouse over its
own routes, and packs orders for online sellers. It is not Sagawa's SGX, which is
[SGH Global Japan](../sagawa-global/README.md).

## Numbers

Its tracking page takes a tracking number (追跡番号). No public page shows one, so there is no
rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Links

The tracking page's form opens `www.sgxpress.com/query/?logic_num=<number>`, and the library
reads the number from `logic_num`.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
