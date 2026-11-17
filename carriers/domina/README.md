# Domina

Domina parcels use enabled universal providers. There is no dedicated adapter.

Domina Entrega Total is a Colombian courier and logistics company.

## Numbers

Its tracker takes a guide number (número de guía). No public page shows a Domina number, so there is
no rule.

## Why there is no adapter

The tracker asks for an image CAPTCHA with each lookup. No public number is known to check its
tracker's replies against.

## Leads

The tracker fetches its CAPTCHA as JSON from `https://trackingbk.infokairos.com.co/api/v1/captcha`
and looks numbers up at `/api/v1/tracking` on the same host, beside `/api/v1/tracking/requestCode`
and `/api/v1/tracking/validateCode`.

## Links

The tracker's script would read a guide from `/idenvio/<number>`, but the server answers that
address with 404, so there are no tracking links.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
