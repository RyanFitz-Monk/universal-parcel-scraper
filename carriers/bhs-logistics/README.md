# BHS Logistics

BHS Logistics parcels use enabled universal providers. There is no dedicated adapter.

BHS Logistics, formerly Bech-Hansen & Studsgaard, is a Danish carrier based in Rønne on Bornholm,
with road transport across Europe, sea and air freight, and pharmaceutical transport.

## Numbers

The tracker asks for the waybill (fragtbrev) number. No public page shows one, so there is no rule.

## Why there is no adapter

The tracking page's script reads a waybill from `n.tntbhstrans.dk/api/tracktrace/<number>` and
shows its latest status. No public number is known to check its replies against.

## Links

The page reads no number from its address, so the catalog sends people to the tracking page.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
