# Yalidine

Reads Algerian guest history through the [official Android app](https://play.google.com/store/apps/details?id=com.yalidine.app)
route, with the public browser tracker as fallback. No account or notification registration is needed.

## Retrieval

The app sends `GET /app/api/parcel-statut.php?tracking={number}` to `yalidine.app`
with its public `Yalidine-App-Android` user agent. A unique result key and every scan
must identify the whole number. The native `datetime` supplies the full facility wall clock,
without an offset. The adapter preserves scan order, wording, agency, commune and wilaya.
An empty array has no identity or explicit missing-parcel statement, so it remains inconclusive.

When configured, TRAWL can recover an unavailable, challenged or malformed mobile reply.
The mobile attempt reserves time for this fallback. Rate limits remain terminal.
The browser opens the blank form so its Turnstile response remains unused, then posts the
whole number and response to the same page on the service's egress. Only carrier-domain
cookies enter that request.

A dedicated browser result card must identify the whole number. Its scan table omits the
year; those validated clocks remain in `provider_time_text`. No lookup year or instant is
invented. The presentation-only current-scan badge is discarded. Only the explicit missing
notice after the bound form POST establishes absence; generic retries remain challenges.

## Limitations

HTTP recognition invokes neither route. The merchant dashboard, recipient accounts,
push subscriptions and delivery reviews are separate operations and are not used.
Enabled universal providers remain available if native recovery fails.

## Testing

Supply `YALIDINE_TRACKING_NUMBER` outside Git, and optionally configure
`FLARESOLVERR_URL` to exercise browser fallback. Run
`npm run test:carriers:live -- carriers/yalidine`.
