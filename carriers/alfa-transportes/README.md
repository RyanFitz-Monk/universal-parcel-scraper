# Alfa Transportes

Alfa Transportes parcels use enabled universal providers. There is no dedicated adapter.

Alfa Transportes is a road carrier based in Caçador, Santa Catarina. It carries part loads and
parcels through its branches and agents in southern Brazil and beyond.

## Numbers

Its tracker takes an invoice (nota fiscal) number or the invoice's 44-digit access key with the
sender's or recipient's CPF or CNPJ. It has no field for an Alfa number, so there is no rule.

## Why there is no adapter

Every lookup needs a CPF or CNPJ and passes a Cloudflare Turnstile check.

## Links

Lookups need the tax id, so there are no tracking links.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
