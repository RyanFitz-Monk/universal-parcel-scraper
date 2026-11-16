# Diálogo Logística

Diálogo Logística parcels use enabled universal providers. There is no dedicated adapter.

Diálogo Logística is the e-commerce delivery unit of BBM Logística, a road carrier based in Curitiba.
It delivers parcels of up to 10 kg in Brazil's state capitals and their metropolitan areas.

## Numbers

Its lookup, a tab of the tracking form on BBM Logística's site, takes the recipient's CPF alone or a
CNPJ with an invoice (nota fiscal) number. It has no field for a Diálogo number, so there is no rule.

## Why there is no adapter

Every lookup needs a CPF or CNPJ. The form posts to SSW, the freight system many Brazilian road
carriers share.

## Links

Lookups need the tax id, so there are no tracking links.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
