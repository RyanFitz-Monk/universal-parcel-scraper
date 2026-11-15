# Cargobus

Cargobus parcels use enabled universal providers. There is no dedicated adapter.

Cargobus (T Grupp OÜ) is an Estonian parcel and pallet carrier that moves parcels on intercity
buses and by courier, with terminal links to Latvia and Lithuania. Its site is cargobus.ee.

## Numbers

Its waybill numbers have no published layout, and no public one has been found, so there is no
rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace site. The page's script reads a shipment with
`GET /tt/api/internal/<number>` on the tracker's host, which answers JSON without a session; for
a number it does not know, `SearchResults` is empty. A found reply carries the courier's own
status names, which the script holds no list of, a delivery progress of five values (editable,
in progress, delivered, missed, unknown), and the sender's and recipient's names and addresses,
which an adapter would have to leave out. No public number has been found to check a found reply
with, so the status names and the layout of the clocks are not known.

## Links

The tracker opens a number from its `keyword` parameter.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
