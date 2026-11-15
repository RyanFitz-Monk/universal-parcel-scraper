# PostaPlus

PostaPlus parcels use enabled universal providers. There is no dedicated adapter.

## Numbers

PostaPlus air waybills are twelve digits. Detection does not claim them, because many carriers
print bare twelve-digit numbers.

## Links

The home page's tracking form opens one waybill from `?trackid={number}&trackby=awb`. Older
links use `sno` on `Customer/ShipmentDetails.aspx`; the library reads both.

## Retrieval lead

The home page's script posts `[{"ShipmentNo": number}]` (or `Reference1`, `Reference2`) to
`/api/postastagingservices/ShipmentTracking`, without a key. Each waybill comes back in
`d.ResponseResult` with a summary (`ST`) and its details (`DT`); an unknown one has `Response`
`FAILED` and the message `NO DATA FOUND`. The public samples are no longer found, so there is no
adapter until a found reply shows the details' fields.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
