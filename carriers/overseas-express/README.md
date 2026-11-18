# Overseas Express

Overseas Express parcels use enabled universal providers. There is no dedicated adapter.

## Numbers

Overseas Express asks for the eight-digit parcel number. Its former tracker explained that the
whole barcode reads as three digits, three digits, the eight-digit number and two more digits,
and that only the eight digits are entered. Archived lookups on its trackers carry those eight
digits. Eight digits are shared with other carriers, so no rule claims them.

## Links

The header form on `www.overseas.hr` sends the number as `trackingid` to
`inet.overseas.hr/auth`. Archived lookups use `is.overseas.hr/tracking/?trackingid={number}`,
`is.overseas.hr/track-and-trace/{number}` and, on the former site,
`www.overseas.hr/Tracking/Package/{number}`. `inet.overseas.hr/{number}` runs the lookup (see
Retrieval), but the gateway refused a desktop Chrome too, so the catalog has no parcel link.

## Retrieval

I-NET, the tracker on `inet.overseas.hr`, looks a code up with
`POST inetapi.overseas.hr/NesyIntegration/GetGuestShipmentDetails` and
`{"Platform":201,"Reference":"{number}"}`, or `ExternalId` for a 14-digit shipment number. Both
hosts sit behind an Azure application gateway that answers HTTP 403 to plain HTTP clients; the
TRAWL browser loads them. Opening `inet.overseas.hr/{number}` forwards to `/auth?id={number}`,
whose guest panel runs that lookup itself, so a TRAWL capture can read the reply once the page
settles. An unknown code answers HTTP 200 with `resultCode` 400 and "Barkodovi nisu pronađeni".

## Why there is no adapter

The newest public sample answers as an unknown code, so no reply has shown a held shipment's
fields. An adapter needs one found reply.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
