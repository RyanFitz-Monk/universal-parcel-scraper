# INTRAS

INTRAS parcels use enabled universal providers. There is no dedicated adapter.

INTRAS CORPORATION carries parcels between Korea and Japan and buys goods for its members. Its
Korean-language site quotes rates in won and yen.

## Numbers

The tracking box on its home page, beside the member sign-in, takes one number. No public page
shows one, so there is no rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Links

The tracking box opens `intras.co.jp/delivery/tracking?number=<number>`, and the library reads
the number from `number`. Without a number that address answers 404, so the canary is the home
page.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
