# PWB

Tracks shipments of PWB (深圳市派万邦科技物流有限公司, 派万邦), a Shenzhen forwarder, on its own
tenant of the Hualei (华磊) forwarder platform. The client is shared with [GZYL](../gzyl/README.md),
whose README describes the platform; this carrier keeps its host and status map.

## How it works

1. `direct`: one GET to `selectTrack.htm?documentCode=<number>` on the tracker at
   `www.pwbpost.com:8082`, then, when the interface holds no row for the number, one POST of the
   same `documentCode` to the tracking page `trackIndex.htm`, which settles not-found
   ([hualei.ts](../gzyl/hualei.ts)).
2. `retry`: the same read once more after a request fails to reach the tracker or hangs.

The tracker answers plain HTTP only, and PWB's site links to it. No account, key, cookie, CAPTCHA
or browser is needed, and no portal link is published, since a plain-HTTP link would leave the
number in the clear. The canary takes HTTPS only, so it checks 17TRACK, not the tracker.

## Notes

- PWB writes its rows in English, some with the platform's Chinese ahead or behind. The rows of
  the line abroad carry no place.
- `Order information has been transmitted to DPD.` is PWB passing the order to its last-mile
  partner, dated back to the day it did. It moves nothing and names no DPD number, so the partner
  cannot be followed from it.
- `目的港已提货 Delivery has been made at the destination port` is the collection from the airline
  at the destination airport, before import clearance, not a delivery.
- Scan times are wall clocks without an offset on the platform's Beijing clock, as
  [GZYL's](../gzyl/README.md) are, and are read on it, the rows abroad too.

## Limitations

PWB's scans are mapped by their wording; a row's kind code, such as `ARRIVAL`, groups several
wordings and decides nothing. Wording the map does not list falls back to the shared wording rules.
The last-mile partner's number is not shown, so the parcel is followed on PWB's tracker only.

## Numbers

PWB's own numbers are PWB, nine digits and CN. The prefix is the forwarder's name, so the rule has
high confidence. No public PWB number has been found, so the corpus holds a synthetic one.

## Testing

`npm run test:carriers:live -- carriers/pwb`, with `PWB_TRACKING_NUMBER` and optionally
`PWB_UNKNOWN_NUMBER` set outside the repository.
