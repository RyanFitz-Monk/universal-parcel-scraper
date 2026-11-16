# Tecmar

Tecmar parcels use enabled universal providers. There is no dedicated adapter.

Tecmar is a road carrier in Embu das Artes, São Paulo, part of the Log-In Logística group. It carries
part and full loads, stores goods and runs the road legs of coastal shipping.

## Numbers

Its customer portal looks a shipment up without a login by the 44-digit access key of its invoice
(NF-e) or transport document (CT-e), or by an invoice number with the sender's and recipient's
CNPJ. It has no number of its own, so there is no rule.

## Why there is no adapter

Every lookup needs an access key or the companies' CNPJs.

## Links

The portal opens `#/nfe/<key>` for an invoice's access key, which is longer than the forty
characters a tracking number may have, so there are no tracking links.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
