# Ghapex Courier

Ghapex Courier parcels use enabled universal providers. There is no dedicated adapter.

Ghapex Courier, formerly Apex Courier, is a Ghanaian courier founded in 2020 in Accra. It delivers
same-day and next-day by motorbike, with cash on delivery, from sorting centres in Accra and
Kumasi, and runs e-commerce fulfilment.

## Numbers

No public page shows a Ghapex delivery number, so there is no rule.

## Why there is no adapter

No public number is known to check the tracker's replies against.

## Leads

The tracking page reads `GET stagingprime.ghapex.com/api/ghp/track/<reference>`, a JSON reply
with a `data` object, and retries the reference in other letter cases.

## Links

The tracking page takes the number from the home page's form, not from its address, so the catalog
sends people to it.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
