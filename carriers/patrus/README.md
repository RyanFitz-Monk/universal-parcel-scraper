# Patrus Transportes

Patrus Transportes parcels use enabled universal providers. There is no dedicated adapter.

Patrus Transportes is a part-load road carrier from Minas Gerais. It serves more than 3,100
municipalities in the South and Southeast, Sergipe, Bahia and Ceará.

## Numbers

Its tracker takes an invoice (nota fiscal), order or tracking number with the sender's or
recipient's CPF or CNPJ. No public page shows a Patrus number, so there is no rule.

## Why there is no adapter

Every lookup needs a CPF or CNPJ.

## Leads

The form posts `action=patrus_rastreio`, `cgc` (the CPF or CNPJ), `tipo` (`REMETENTE` or
`DESTINATARIO`), `doc` (`NF`, `PEDIDO` or `TRACKINGNUMBER`) and `nDoc` to
`/wp-admin/admin-post.php`.

## Links

Lookups need the tax id, so there are no tracking links.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
