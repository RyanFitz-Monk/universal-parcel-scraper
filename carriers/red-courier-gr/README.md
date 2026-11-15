# Red Courier

Red Courier parcels use enabled universal providers. There is no dedicated adapter.

Red Courier is a courier in Kallithea, Athens, Greece, mainly for Attica, with same-day and next-day
delivery. Its site is redcourier.gr.

## Numbers

Its tracking form accepts 6 to 10 digits. No public page shows a whole number, so there is no rule.

## Why there is no adapter

Its tracking page runs on Hermes Courier App, a courier software by JK Software, and shows a
voucher's status from its creation to its delivery. The page posts `action=hermes_track` and
`tracking_number` to the site's `wp-admin/admin-ajax.php`, without a token, and puts the HTML
fragment it gets back on the page. The page's script names no status, so the fragment's layout and
wordings are known only from a found voucher. With no public number to check its replies against,
there is no adapter.

## Links

The tracking page opens numbers from its `voucher` parameter.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
