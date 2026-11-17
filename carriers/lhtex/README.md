# LHT Express

Tracks Guangdong LHT Express waybills through the guest lookup on its official homepage.

`direct` reads `orderquery.php` with the whole waybill in `waybillNo`. `retry` repeats
only a network failure within the lookup budget. No account, phone or CAPTCHA is needed.

The response must contain exactly one matching waybill. Scan clocks stay local because
the carrier states no offset. An empty successful list remains inconclusive so enabled
providers can still answer. Signature images are omitted.

The supported numeric shape overlaps other carriers, so it does not establish ownership
or enter automatic recognition. The homepage renders results in place and has no tracking link.

`LHTEX_TRACKING_NUMBER=<public sample> npm run test:carriers:live -- carriers/lhtex`
