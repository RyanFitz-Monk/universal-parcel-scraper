# Rapid Courier

Rapid Courier parcels use enabled universal providers. There is no dedicated adapter.

Rapid Courier is a courier in Thessaloniki, Greece, with same-day delivery in Athens and
Thessaloniki and delivery in one to three working days elsewhere in Greece. Its site is
rapidcourier.gr.

## Numbers

Its tracking form accepts 6 to 10 digits. No public page shows a whole number, so there is no rule.

## Why there is no adapter

Its tracking page runs on Hermes Courier App, a courier software by JK Software, and shows a
voucher's status. The page posts `action=hermes_track` and `tracking_number` to the site's
`wp-admin/admin-ajax.php`, without a token, and puts the HTML fragment it gets back on the page. The
page's script names no status, so the fragment's layout and wordings are known only from a found
voucher. With no public number to check its replies against, there is no adapter.

## Links

The tracking page opens numbers from its `voucher` parameter.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
