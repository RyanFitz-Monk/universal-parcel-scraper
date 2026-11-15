# Ruiqi Logistics

Ruiqi Logistics parcels use enabled universal providers. There is no dedicated adapter.

Ruiqi Logistics (锐骑物流, 深圳市锐骑物流有限公司) is a Shenzhen cross-border operator of small-parcel
lines to the United Kingdom, Germany and the United States, which flies parcels out, clears them and
hands them to postal and express carriers there. Its site is ruiqiexpress.com.

## Numbers

The site's tracking script checks its own numbers against `RQ`, a channel code (`US`, `GB`, `DE`,
`Y2`, `VK` or `AC`) and twelve digits. That layout is the company's own, so the rule names Ruiqi
with high confidence. No public page shows a whole number; the corpus holds a made-up one.

## Why there is no adapter

No public number is known to check the tracker's replies against.

## Leads

The site's tracking bar reads `GET trackapi.ruiqiexpress.com/api/hualei/track?documentCode=<number>`,
a JSON proxy of its Hualei (华磊) tracker.

## Links

The tracking bar takes the number only in its form, so the catalog sends people to the site.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
