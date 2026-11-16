# Fixtures

Each file is a page `www.aaacooper.com/pwb/Transit/ProTrackResults.aspx?ProNum=` returned, cut
down to the form and the panel the adapter reads.

- `delivered.html` is the reply for a public sample in `../numbers.json`.
- `out-for-delivery.html` is modeled on it, with an invented PRO number and references, the
  status and row wording of an archived page, and no signer.
- `not-found.html` is the reply for an invented PRO number.
- `pending.html` is the reply for a placeholder PRO number of zeros.
- `captcha.html` is the image CAPTCHA the page asked for in place of a public sample after
  many lookups from one address. It names no shipment.
