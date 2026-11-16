# TJW Fragt

TJW Fragt parcels use enabled universal providers. There is no dedicated adapter.

TJW Fragt is a Danish carrier formed by the merger of Rømming Dankurér and Tjw Transport, with its
terminal in Karlslunde. It runs courier transport across Europe, distribution, part and full loads,
and next-day delivery across Denmark.

## Numbers

No public page shows a TJW Fragt number, so there is no rule.

## Why there is no adapter

The tracker is the company's page in AliceTMS, under the name `romming`, an AngularJS app at
`t.alicetms.dk` that posts the company and the number to `/TrackAndTrace/Trace`. No public number is
known to check its replies against.

## Links

The tracking box on the company's site opens `t.alicetms.dk/#/romming/TrackAndTrace/<number>` over
plain HTTP; the catalog uses HTTPS. The AliceTMS page has no search box, so the catalog's search
page is the company's tracking page.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
