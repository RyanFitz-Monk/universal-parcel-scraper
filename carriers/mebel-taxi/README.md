# Mebel Taxi

Mebel Taxi parcels use enabled universal providers. There is no dedicated adapter.

Mebel Taxi, of Baranów in Greater Poland, carries furniture from Poland to homes in Germany,
Austria and other nearby countries.

## Numbers

No public page shows a Mebel Taxi number, so there is no rule.

## Why there is no adapter

The site's "Sprawdź przesyłkę" form posts the number as `tracking_id` to `/order/check`, which
refuses a GET. No public number is known to check its replies against.

## Links

The tracker takes numbers only in a form post, so the catalog sends people to the home page.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
