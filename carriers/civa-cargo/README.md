# Civa Cargo

Civa Cargo parcels use enabled universal providers. There is no dedicated adapter.

Civa Cargo carries parcels on the routes of Turismo CIVA, a Peruvian intercity bus company.

## Numbers

Its tracker takes the document's series and number with the secret key printed for the shipment, or
with the client's DNI or RUC and the route. It has no field for a number alone, so there is no rule.

## Why there is no adapter

Every lookup needs the shipment's secret key or the client's ID document, and sends an invisible
reCAPTCHA token.

## Links

Lookups need the secret key or the ID document, so there are no tracking links.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
