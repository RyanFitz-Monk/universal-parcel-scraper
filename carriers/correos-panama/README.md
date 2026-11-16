# Correos Panamá

Correos Panamá parcels use enabled universal providers. There is no dedicated adapter.

Correos Panamá, Correos y Telégrafos Nacionales de Panamá, is Panama's national post.

## Numbers

Correos Panamá gives letters, parcels and EMS items UPU S10 numbers ending in `PA`. Generic postal
detection handles these numbers, so no rule for Correos Panamá claims them.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Links

Its UPU tracker opens `IPSWeb_item_events.aspx?itemid=<number>`, and the library reads the number
from that address.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
