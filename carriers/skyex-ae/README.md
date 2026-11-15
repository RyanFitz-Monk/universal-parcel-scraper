# Sky Express International

Sky Express International parcels use enabled universal providers. There is no dedicated
adapter.

## Numbers

Sky Express International is a Dubai courier. Its airwaybills are ten digits; one comes from a
lookup on its tracker that a search engine indexed. Ten-digit runs are shared by many carriers,
so no rule claims them and the gap is declared.

## Retrieval lead

The tracking page posts `{"TrackingIdList": [number], "TrackingType": "AWB"}` to `/API/Track/`
on `skyexpressinternational.com`, without a key, and gets one entry per airwaybill: origin,
destination, booking and delivery dates, `DeliveryStatus` and a `Milestones` list of date and time,
location and description. An unknown airwaybill comes back with only its number and the status
"Tracking information is not available at this moment. Please try again later." No found reply
has been seen, so there is no adapter.

## Links

The tracking page reads `trackingType` and `tid` from its address, so
`skyexpressinternational.com/Home/Tracking?trackingType=AWB&tid={number}` opens one airwaybill;
`trackingType=REF` looks up a shipper reference instead.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
