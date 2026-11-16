# Correios de Cabo Verde

Correios de Cabo Verde parcels use enabled universal providers. There is no dedicated adapter.

Correios de Cabo Verde is Cape Verde's national post.

## Numbers

It gives letters, parcels and EMS items UPU S10 numbers ending in `CV`, and its tracker follows
other posts' items into the country too. Generic postal detection handles these numbers, so no rule
for Correios de Cabo Verde claims them.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Links

`correios.cv/ferramentas/tracking?tracking-ids=<number>` looks a number up, and the library reads
the number from that address.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
