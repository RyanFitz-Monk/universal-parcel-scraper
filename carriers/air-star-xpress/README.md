# Air Star Xpress

Air Star Xpress parcels use enabled universal providers. There is no dedicated adapter.

Air Star Xpress is a domestic courier network based in Jaipur, India.

## Numbers

The tracker takes docket numbers. Complaints give eight-digit and nine-digit numbers. Digit
runs of these lengths are printed by many other carriers, so no rule claims them.

## Retrieval lead

The tracker is an ASP.NET page on `authorcodesoftware.in` that posts the docket back to itself as
`txtdoc`, with its view state and the event target `spanid`. A found docket fills the status
(`#lblstatus`), the docket (`#spcnote`) and a JSON list of time, location and status detail
(`#txt1`). An unknown docket gets the empty page back; its "Invalid or AWB Not Exist" block is on
the empty page too, so only those elements tell the answers apart. No found reply has been seen,
so there is no adapter.

## Links

The tracker, hosted by its software vendor and linked from the carrier's home page, posts its
form back to the same page, so no address opens one parcel.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
