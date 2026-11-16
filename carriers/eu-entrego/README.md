# Eu Entrego

Eu Entrego parcels use enabled universal providers. There is no dedicated adapter.

Eu Entrego is a Brazilian last-mile carrier whose deliveries are made by independent couriers. It
runs same-day, next-day, ship-from-store and return services for retailers.

## Numbers

Its tracker asks for the recipient's CPF or CNPJ, sometimes with the order code, and has no field
for an Eu Entrego number of its own. So there is no rule.

## Why there is no adapter

Every lookup needs a CPF or CNPJ and passes a reCAPTCHA.

## Links

Lookups need the tax id, and the links in its notifications carry the shipper's own id, so there
are no tracking links.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
