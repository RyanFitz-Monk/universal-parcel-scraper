# Sprint

Sprint parcels use enabled universal providers. There is no dedicated adapter.

Sprint is an Egyptian last-mile courier for online shops. Its website, sprint.xyz, serves a
certificate for another host, so the catalog sends people to the public order tracking page of its
merchant portal.

## Numbers

No public page shows a Sprint number, so there is no rule.

## Why there is no adapter

The tracking page is a Flutter app that looks numbers up through Firebase callable functions. No
public number is known to check its tracker's replies against.

## Leads

The page calls the Firebase callable functions `waybillSearch` and `multiWaybillSearch` of project
`sprint-af066`. Their replies follow LogixERP's data model, the platform [G4S Courier
Kenya](../g4s-kenya/README.md) tracks on too.

## Links

The portal's `/orderTracking/<number>` route opens the same empty search form, without the number,
so there are no tracking links.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
