# Fiege Netherlands

Fiege Netherlands parcels use enabled universal providers. There is no dedicated adapter.

Fiege Netherlands is the Dutch transport unit of FIEGE, a logistics group from Greven. Its
WebSped portal has a public shipment search beside the customer sign-in.

## Numbers

The search takes an order, reference, picking or commission number, or an SSCC. No public page
shows one, so there is no rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Links

`websped-netherlands.fiege.com/TrackAndTrace/Search?SearchExpression=<number>` looks one
shipment up, and the library reads the number from `SearchExpression`.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
