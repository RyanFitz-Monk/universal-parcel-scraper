# Xportel

Xportel parcels use enabled universal providers. There is no dedicated adapter.

Xportel, run by Boggletree Technologies of New Delhi, ships Indian sellers' exports and hands them to
carriers such as USPS, Royal Mail, FedEx, Aramex and DPD for delivery. Its site is xportel.com.

## Numbers

Its tracker takes Xportel order numbers, one or several separated by commas. No public page shows
one, so there is no rule. The delivering carrier's number on a forwarded parcel belongs to that
carrier.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Leads

The tracker's script looks an order up with
`GET https://api.xportel.com/api/external/order-tracking/order-number/<number>`.

## Links

`tracking.xportel.com/?trackingNumber=<number>` looks the order up on load, and the library reads the
number from `trackingNumber`.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
