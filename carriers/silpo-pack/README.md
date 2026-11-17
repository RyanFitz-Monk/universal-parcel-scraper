# Silpo Pack

Silpo Pack parcels use enabled universal providers. There is no dedicated adapter.

Silpo Pack is the last-mile delivery network of Silpo Systems, a Santo Domingo company that also
makes the SILPOSTAL postal software. It has offices in every province of the Dominican Republic.

## Numbers

Its tracker takes a shipment code. No public page shows a Silpo Pack number, so there is no rule.

## Why there is no adapter

silposystems.com answers clients other than browsers with a Cloudflare challenge. No public number
is known to check its tracker's replies against.

## Leads

The tracking page posts `codigo_envio` with a WordPress nonce, `silpo_tracking_nonce`, back to
`/tracking/`.

## Links

The form posts the number with a nonce from the page, so there are no tracking links.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
