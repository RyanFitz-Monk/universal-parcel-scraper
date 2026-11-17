# Via Pajuçara

Via Pajuçara parcels use enabled universal providers. There is no dedicated adapter.

Via Pajuçara is a parcel and part-load road carrier based in Guarulhos, São Paulo.

## Numbers

Its tracker takes a CPF or CNPJ and lists that person's or company's shipments. It has no field for
a Via Pajuçara number, so there is no rule.

## Why there is no adapter

Every lookup needs a CPF or CNPJ.

## Leads

The tracker reads `https://atlas.hyerdev.com.br/api/rastreamento/cpf/v2/notas` on the HyerDev
platform. Its portal is laid out like [Atual Cargas](../atual-cargas/README.md)'s.

## Links

Lookups need the tax id, so there are no tracking links.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
