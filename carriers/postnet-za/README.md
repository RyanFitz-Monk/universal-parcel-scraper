# PostNet

PostNet parcels use enabled universal providers. There is no dedicated adapter.

PostNet is a South African franchise network of counters for courier, print and business services.
It sells its own counter-to-counter waybills, which [Courier IT](../courier-it/README.md) carries,
and resells DHL and Aramex.

## Numbers

Its counter-to-counter waybills are PN or PP and seven digits. The public ones are listed under
Courier IT, which carried them. The shape is too generic to claim, so there is no rule.

## Why there is no adapter

PostNet's tracker asks DHL, Aramex, Courier IT, Sprint and Coastal in turn, with a token from its
page, and shows the first answer. Courier IT's tracker shows the counter-to-counter waybills too.

## Links

`postnet.co.za/tracker?pnpp=<number>` looks one number up, and the library reads the number from
that address.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
