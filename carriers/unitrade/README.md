# Unitrade

Unitrade parcels use enabled universal providers. There is no dedicated adapter.

Unitrade (Юнитрейд) of Moscow is a customs broker and international forwarder. For marketplace
sellers, mostly in China, it carries parcels from its warehouse in China through export and import
customs to Moscow, then to a pickup point or a courier. Recipients follow them on its UNI DIGITAL
LOGISTICS tracking page.

## Numbers

The tracker takes Unitrade's own track numbers and order or marketplace numbers. Its script reads
twelve characters, three letters or digits, seven digits and two letters or digits, as Unitrade's
own number and anything else as another number. No public page shows a whole number, so there is
no rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Leads

The page reads `GET https://api.unitrade.space/v1/public/track-events`, with JSON arrays of its
own numbers in `trackNumbers` and of other numbers in `externalNumbers`.

## Links

The tracker reads numbers only from its form, so no address opens one parcel.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
