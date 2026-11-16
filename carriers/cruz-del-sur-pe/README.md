# Cruz del Sur Cargo

Cruz del Sur Cargo parcels use enabled universal providers. There is no dedicated adapter.

Cruz del Sur Cargo carries parcels for Cruz del Sur, a Peruvian intercity bus company, with agencies
across Peru and home collection and delivery. It is a different company from Argentina's [Cruz del
Sur](../cruz-del-sur/README.md).

## Numbers

Private senders track by a ten-character web key, and companies by their order number or the waybill
series and number. The key is private to the shipment, so there is no rule.

## Why there is no adapter

A private lookup needs the shipment's web key or an ID document with a short key; a company lookup
needs the client's name.

## Links

The tracking form posts its fields, so there are no tracking links.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
