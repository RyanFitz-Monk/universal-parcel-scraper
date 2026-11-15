# Alem TAT

Alem TAT parcels use enabled universal providers. There is no dedicated adapter.

Alem TAT is a courier service in Kazakhstan.

## Numbers

The tracker asks for a shipment number of at least three characters, and the API
documentation calls it the waybill number. The carrier's documentation example is eight
digits. Digit runs of that length are printed by many other carriers, so no rule claims them.

## Retrieval lead

The tracking page posts `Path=find`, `Controller=getWayBill` and the number to
`alemtat.kz/api.php`, without a challenge; the page's Turnstile widget belongs to its contact form.
The page reads the registration time, origin and destination, piece count and current state, and
for each piece events with a date, time, comment and station. An unknown number answers `null`,
which the page shows as no information for shipments up to six months old. No found reply has been
seen, so there is no adapter.

## Links

The tracking page reads the number from its `n` query parameter and looks it up on load, so
`alemtat.kz/tracking/?n=` opens one parcel; the number is read from that address.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
