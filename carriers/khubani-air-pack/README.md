# Khubani Air Pack

Khubani Air Pack parcels use enabled universal providers. There is no dedicated adapter.

KHUBANI Air Pack (KAP) is a courier and cargo company headquartered in Jaipur that has served all
of India for over twenty years. Its site is khubaniairpack.com.

## Numbers

Its tracking page takes one or more tracking numbers. No public page shows one, so there is no
rule.

## Why there is no adapter

Its tracking page posts each number to the JSON API of Xpresion, a courier management system, at
`xpresion.khubaniairpack.com/api/v1/Tracking/Tracking`, with a fixed login the page gives every
visitor. No public number is known to check the replies against.

## Links

`www.khubaniairpack.com/tracking.html?awbno=<number>` looks the number up on load, and the library
reads the number from `awbno`.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
