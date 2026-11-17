# G4S Courier Kenya

G4S Courier Kenya parcels use enabled universal providers. There is no dedicated adapter.

G4S Kenya, an Allied Universal company, runs a domestic and international courier service beside its
cash and security services, with more than 140 branches in all 47 counties.

## Numbers

Its tracker takes a waybill or tracking number. No public page shows a G4S Courier Kenya number, so
there is no rule.

## Why there is no adapter

www.g4s.com puts a bot check before its pages, which a browser passes by itself. No public number is
known to check its tracker's replies against.

## Leads

The tracking page embeds LogixERP's TrackDocket widget from `g4scourier.logixerp.com`. Its form
posts `docketNumber`, with the widget key the page gives every visitor, to
`/services/widgets/DocketStatusDetails`. [Sprint](../sprint-eg/README.md) runs on the same platform.

## Links

The widget posts the number and answers in its frame, so there are no tracking links.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
