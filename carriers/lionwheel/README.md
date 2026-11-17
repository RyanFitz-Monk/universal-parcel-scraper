# LionWheel

LionWheel parcels use enabled universal providers. There is no dedicated adapter.

LionWheel is an Israeli delivery management and route planning platform. Couriers that run on it
send recipients to one public tracking page on lionwheel.com for every courier's codes.

## Numbers

The tracking page asks for the code the courier gave. No public page shows one, so there is no
rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Links

`lionwheel.com/tracking?code=<code>` opens one delivery, also under a language prefix such as
`/en/`, and the library reads the code from `code`.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
