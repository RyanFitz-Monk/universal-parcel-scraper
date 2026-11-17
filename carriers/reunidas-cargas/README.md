# Reunidas Cargas

Reunidas Cargas parcels use enabled universal providers. There is no dedicated adapter.

Reunidas Cargas, of Caçador, Santa Catarina, is the freight company of the Reunidas group, whose bus
lines share the name. From about 52 service points it carries part loads, express freight and
parcels to more than 1,300 municipalities in southern Brazil and around São Paulo and Campinas.

## Numbers

Its tracker takes the invoice's 44-digit access key alone, or an invoice, order or collection number
with a CPF or CNPJ. It has no number of its own, so there is no rule.

## Why there is no adapter

Every lookup needs a tax id or the invoice's access key, and the site puts a Cloudflare Turnstile
check before its pages.

## Leads

The form posts `tipo`, `chave_nfe`, `cpfcnpj`, `NR` and `sigla_emp=REU` to `/rastreamento`. Its
detailed tracking page posts to `https://ssw.inf.br/2/ssw_resultSSW` with the same company code:
SSW, the freight system [Bauer Express](../bauer-express/README.md) and [Ativa
Logística](../ativa-logistica/README.md) use too.

## Links

The forms post their fields, so there are no tracking links.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
