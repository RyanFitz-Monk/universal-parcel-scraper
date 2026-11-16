# Chronopost Maroc

Chronopost Maroc parcels use enabled universal providers. There is no dedicated adapter.

Chronopost Maroc, Chronopost International Maroc, is the express parcel company of Poste Maroc and
Geopost in Morocco. It is separate from [Chronopost](../chronopost/README.md) in France.

## Numbers

Its tracker takes a parcel, collection or missed-delivery notice number, and its example is fourteen
digits and a letter. No public page shows a Chronopost Maroc number, so there is no rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Links

`chronopost.ma/suivez-votre-envoi?SendingNumber=<number>` looks one number up, and the library reads
the number from that address.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
