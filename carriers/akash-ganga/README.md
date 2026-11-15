# Akash Ganga Courier

Akash Ganga Courier parcels use enabled universal providers. There is no dedicated adapter.

Akash Ganga Courier is a domestic courier network in India, based in New Delhi.

## Numbers

The tracking field on the home page takes any AWB number up to one hundred characters. A
lookup archived from the carrier's older tracker and customer complaints show eight-digit
consignment numbers, and a later complaint shows a nine-digit one. Digit runs of these lengths
are printed by many other carriers, so no rule claims them.

## Retrieval lead

`Tracking.aspx?AWB={number}` renders the answer on the server, without a challenge: the
booking (from and to centre, date and time, consignee), the current status, then transit and
delivery details. A number it does not show leaves those fields empty under the number. No
found reply has been seen, so there is no adapter.

## Links

The home page opens the tracker at `Tracking.aspx` with the number as `AWB`, which is the
tracking address. Lookups archived from the older tracker carry it as `ConNo` on
`OnlineTracking.aspx`; the number is read from both.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
