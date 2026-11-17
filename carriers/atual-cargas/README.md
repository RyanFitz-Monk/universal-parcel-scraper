# Atual Cargas

Atual Cargas parcels use enabled universal providers. There is no dedicated adapter.

Atual Cargas is a road carrier in São Paulo.

## Numbers

Its tracker takes the sender's, recipient's or payer's CPF or CNPJ with an invoice (nota fiscal)
number. It has no field for an Atual Cargas number, so there is no rule.

## Why there is no adapter

Every lookup needs a CPF or CNPJ.

## Leads

The portal loads `/api/auth/portal-settings` and `/api/auth/public-modules`, and looks shipments up
at `/rastreio/deslogado` with an `x-rastreio-token` header.

## Links

Lookups need the tax id, so there are no tracking links.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
