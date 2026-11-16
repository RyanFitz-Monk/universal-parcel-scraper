# 7-ELEVEN Taiwan

7-ELEVEN Taiwan parcels use enabled universal providers. There is no dedicated adapter.

7-ELEVEN Taiwan (統一超商) carries store-to-store parcels: 交貨便 drop-offs, 賣貨便 orders and
store pickups for online shops.

## Numbers

The E-Tracking page asks for an eight-character drop-off code or an eleven-digit pickup code.
Archived lookups also show twelve-character service codes, a letter and eleven digits. No
rule claims these layouts: bare eleven digits are printed by many carriers, and a D with eleven
digits is the shape of YTO's own rule.

## Links

`eservice.7-11.com.tw/E-Tracking/search.aspx` with `CRM_PaymentNo`, `txtProductNum`,
`ProductNum` or `TrackingNo` carries the number in archived lookups, and the library reads the
number from that address. Only the seller platform's `CRM_PaymentNo` link showed a history; the
others open the search form.

## Why there is no adapter

The E-Tracking page answers only after its form is posted with a four-character picture code
tied to the page's session. The seller platform's `CRM_PaymentNo` link, with its `FLAG` and
`FROM=C2CPlatform` parameters, answers 不允許查詢 (lookup not allowed) for every number,
made-up ones too, so it says nothing about the parcel. Without `FLAG` it opens the search form.
The other E-Tracking pages either ask for the same code or are closed.

The 賣貨便 site links to the same page, and its order pages need a member's sign-in. The
7-ELEVEN Android app (`ecowork.seven`) opens that site, and OPEN POINT
(`tw.net.pic.m.openpoint`) opens it with the member's session.

The [SHOPMORE app](https://shopmoreapp.sp88.tw/About?nav=1&style=0)
(`com.presco.shopmore`) and its [public search page](https://shopmoreapp.sp88.tw/Search)
use the guest JSON endpoint `POST /api/Search/Search` on `shopmoreapp.sp88.tw`.
It takes an array of `sortId`, `channel` and `paymentNo` objects. Package details use
`/api/Package/QueryPackageDetail` with an id returned by search. This route still lacks a
confirmed whole-number history response. Some replies shorten the submitted number,
so an empty result cannot establish that the requested parcel is missing. The guest
history and identity contract must be established before adding an adapter.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
