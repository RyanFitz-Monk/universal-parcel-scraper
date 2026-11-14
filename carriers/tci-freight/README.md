# TCI Freight

Tracks domestic road-freight consignments of TCI Freight, separately from TCI Express.

## How it works

`direct` posts the whole consignment as `CnsNo` and `DivisionCode: "1"` to the
`ShipmentTrackingList` guest endpoint in the official site's `aerp.tcifreight.in`
TLOG tenant. The signed-out client sends `Authorization: Bearer null`; no account,
issued token, session or browser is needed. The web form's arithmetic check is local;
the API request and the client's deep-link lookup carry no answer.

The summary must name the whole consignment, and every populated dispatch identity
must agree. Only the scan wording, city and displayed `STATUS_DATE` are read.
`LIST_ORDER` is an internal sort clock, so it does not add time precision to a date.

## Limitations

`Invalid cns !` does not distinguish an absent consignment from an invalid number;
it stays inconclusive. Delivery documents, contact details, vehicle positions and
account operations are excluded. Shared numeric shapes do not establish TCI ownership;
explicit selection or a named handoff is required.

The official customer app links a customer dashboard; it supplies no separate guest
history protocol needed by this adapter.

## Testing

`npm run test:carriers:live -- carriers/tci-freight`
