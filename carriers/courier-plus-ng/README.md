# CourierPlus

CourierPlus parcels use enabled universal providers. There is no dedicated adapter.

## Numbers

CourierPlus is a Nigerian courier and logistics company. Its waybills seen on its own tracker
address are a digit, a letter and eleven digits. No rule claims them: the shape is also La
Poste's two-character layout, and nothing in the number names CourierPlus.

## Retrieval lead

The track-shipment page posts `{"tracking_no": [number]}` to
`client-api.courierplus-ng.com/api/v1/public/track` as JSON:API, with a token the page gives every
visitor. The page reads each waybill's `awbNo` and a `tracking_status` list of status, location
and date. An unknown waybill gives an empty `data` list and the message "No data found for the
specified shipment numbers". No found reply has been seen, so there is no adapter.

## Links

The public tracker on selfservice.courierplus-ng.com looks parcels up through a request the
page sends, so no address opens one parcel there. The older tracker on
trackplus.courierplus-ng.com took the number in its `query` parameter, and those addresses are
read.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
