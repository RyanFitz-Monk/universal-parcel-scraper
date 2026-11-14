# 360Lion

360Lion parcels use enabled universal providers. There is no dedicated adapter.

360Lion (纬狮物流), formerly Wish Global Logistics, is a Shenzhen operator of cross-border lines to
Latin America, delivering the last mile itself in Mexico. Its site is 360lion.com.

## Numbers

Archived lookups on its former tracker show WSH, a two-letter destination country, ten digits and
YQ, and a complaint about a SHEIN parcel that ProShips delivered in Colombia gives a number of the
same layout. The samples come from two sources, so the rule is low.

## Why there is no adapter

The tracking page asks an open JSON endpoint, `GET /prod-api/toms/crossSite/oms/hawbcode/v2?codes=`,
without a session or CAPTCHA, and files unknown numbers under a not-found group. A found reply
lists each scan with its place's offset (`timeZone` "-3" in Argentina, "+8" at Pudong), a country
or airport code, 360Lion's English, the last mile's own wording and a code (`WSD051`), and names
the departure and destination countries. It also answers for a number of a destination country's
two letters and ten digits, which detection does not offer 360Lion for: no public sample of that
layout is known.

ParcelsApp copies 360Lion's scans at their wall clock under the same codes, and reads them on
each place's clock.

## Links

The tracking page opens the number from its `trackNumber` parameter.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
