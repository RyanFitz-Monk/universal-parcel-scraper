# Rohlig SUUS Logistics

Rohlig SUUS Logistics parcels use enabled universal providers. There is no dedicated adapter.

Rohlig Suus Logistics S.A., of Warsaw, is a Polish logistics operator: a domestic groupage and
pallet network, full loads, sea and air forwarding, contract logistics and deliveries for online
shops. It is a different company from Röhlig Logistics of Bremen (`rohlig`), with its own tracker
and numbers.

## Numbers

Its guest tracker takes a parcel number. No public page shows one, so there is no rule.

## Why there is no adapter

The guest tracker sends an invisible Google reCAPTCHA v3 token with each lookup. No public number
is known to check its replies against.

## Leads

`portal.suus.com/visibility` asks `GET https://portal.suus.com/api/parcel/guest/tracking/orders`
with the number as `parcelNumber` and the token in a `recaptcha-token` header.

## Links

`portal.suus.com/order-details/<number>` opens one parcel, and the library reads the number from
that address.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
