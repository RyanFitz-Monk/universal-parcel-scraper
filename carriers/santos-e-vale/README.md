# Santos e Vale

Santos e Vale parcels use enabled universal providers. There is no dedicated adapter.

Grupo Santos e Vale is a Portuguese distribution and road transport group founded in 1982, with
cross-docking platforms in Portugal and Spain. It carries pallets and parcels across the Iberian
Peninsula in 24 to 48 hours and runs contract logistics.

## Numbers

The tracker asks for a reference, its own written as 9990 and five more characters or the
customer's reference. No public page shows a whole reference, so there is no rule.

## Why there is no adapter

The tracker asks for the destination postcode as well as the reference, and no public reference is
known to check its replies against.

## Leads

The tracking page embeds a form that posts `reference`, `postal_code` and a CSRF token to
`/tracktrace/` on its own host.

## Links

The tracker takes the reference only with the postcode in a form post, so the catalog sends people
to the tracking page.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
