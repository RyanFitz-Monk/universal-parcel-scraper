# SiCepat Ekspres

The dedicated adapter reads ordinary domestic numeric waybills through the official
[SiCepat Android app](https://play.google.com/store/apps/details?id=com.sicepat.consumer)'s guest API.
Its partner-specific TKP01 branch and account services are separate.

TRAWL reproduces the app's inline hidden WebView at its configured SiCepat origin and asks
Google for one fresh reCAPTCHA v3 token with the app's tracking action. This does not load
the website's homepage. The helper returns a tagged verification envelope, not a tracking
response. The SDK uses that token once through its supplied HTTP transport, with the shared
public app client identifier, then drops it. No profile, account, phone digits or OTP is used.
The compatible SiCepat helper must be installed in TRAWL. Verification refusals, blocked
HTML, rate limits, malformed replies and a missing waybill stay distinct; providers remain
available when the guest flow fails.

The reply must echo the whole waybill. The adapter keeps the dated history and native codes,
leaving unstated scan zones and minute precision intact. The field named `city` contains the
whole scan sentence; bracketed facilities become locations, while named couriers are removed.
Contact, recipient, address and proof-of-delivery fields are discarded. The current history
supplies the summary; an unused estimate or an undated account field does not replace it.

The generic numeric input has no carrier detection rule or HTTP recognition. Explicit carrier
selection and supported named handoffs can ask the adapter. Public examples and their sources
are in [numbers.json](numbers.json).

Run `npm run test:carriers:live -- carriers/sicepat` with `SICEPAT_TRACKING_NUMBER`, optionally
`SICEPAT_UNKNOWN_NUMBER`, and `FLARESOLVERR_URL` supplied outside Git.
