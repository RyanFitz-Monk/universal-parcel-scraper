# Fixtures

Whole replies of `apm.gls.nl/api/tracktrace/v1/{number}/postalcode/{postcode}/details/{language}`
for public samples, pretty-printed. Each number and the archived lookup it comes from are in
[`numbers.json`](../numbers.json). `delivered-abroad.json`, `delivered.json` and
`parcel-locker.json` are live replies for numbers the Wayback Machine archived; the others are
archived replies.

- `delivered-abroad.json` comes from Poland: GLS Poland's scans, a check scan at the handover,
  the hub in Utrecht and a delivery in Amsterdam. Its parcel number starts with `00` and ends in
  another check digit than its 12-digit GLS number.
- `out-for-delivery.json` and `delivered.json` are one parcel from Germany, out for delivery in
  Rotterdam with today's window carrying an offset, then delivered.
- `planned.json` is out for delivery with a window without offsets, after a day not taken out
  on a round.
- `registered.json` is a label announced to GLS and not handed over.
- `shop-drop-off.json` is handed in at a ParcelShop in Germany by the sender, with the label's
  payment, a check scan and a handover to GLS at the same clock.
- `not-home.json` is in Dutch: a failed attempt and the return to the depot after it.
- `parcelshop.json` is in Dutch: two attempts, an instruction from the recipient, rounds without
  the parcel, then left at a ParcelShop, whose name and address the reply gives.
- `parcel-locker.json` was archived under its 8-character track ID: locker bookings, the drop
  in a locker, the locker's notice and the recipient taking the parcel out.
