# 4A Express

4A Express parcels use enabled universal providers. There is no dedicated adapter.

4A Express Ltd ("4A Express WorldWide") is a courier with offices in Nicosia, Limassol, Larnaca and
Greece, for local and international express items. It holds a general postal authorisation from
OCECPR.

## Numbers

Its [questions page](https://4aexpress.com/%cf%83%cf%85%cf%87%ce%bd%ce%ad%cf%82-%ce%b5%cf%81%cf%89%cf%84%ce%ae%cf%83%ce%b5%ce%b9%cf%82/)
says an air waybill has twelve digits. Many carriers use that shape and no public page shows a whole
number, so there is no rule.

## Why there is no adapter

The tracker at `cms.4aexpress.com/Query/TrackAwbNoQuery.aspx` (Sagar Informatics courier software)
takes up to ten waybills; its script posts `{"AWBNo": ...}` as JSON to
`TrackAwbNoQuery.aspx/ShowAwbNoQuery`. With no public number to check its replies against, there is
no adapter.

## Links

The tracker looks numbers up in place, so no address opens one shipment.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
