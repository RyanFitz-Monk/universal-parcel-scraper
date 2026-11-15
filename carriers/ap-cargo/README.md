# AP Cargo

AP Cargo parcels use enabled universal providers. There is no dedicated adapter.

## Numbers

AP Cargo waybill numbers have eight digits. Archived replies of AP Cargo's former tracking API
show them with their history. Eight digits are shared by several carriers and nothing in the
number points to AP Cargo, so no rule claims them.

## Retrieval lead

The tracking page asks an AWS API Gateway endpoint, `…/Prod/waybill-tracking?waybillNumber={number}`,
named in the page, without a key. The page reads the waybill's `Items`, each a date with
`DeliveryStatus` entries of status, location and date and time. An unknown waybill answers
`success` false and `statusCode` 404 around an empty record. No found reply has been seen, so
there is no adapter.

## Links

AP Cargo's tracking page reads the waybill number from a form and asks a separate API for the
result, so no address opens one parcel.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
