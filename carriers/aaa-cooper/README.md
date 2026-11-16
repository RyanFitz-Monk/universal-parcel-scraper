# AAA Cooper

Tracks AAA Cooper Transportation's less-than-truckload freight in the United States by its PRO
number, from the server-rendered results page of its website.

## How it works

`GET https://www.aaacooper.com/pwb/Transit/ProTrackResults.aspx?ProNum={PRO}` renders the
shipment on the server: the PRO, BOL and PO numbers, the origin and destination service
centers, the pickup and delivery days, the status, who signed, the pieces and weight, and the
tracing rows. One GET reads it, with no account, cookie or key. A request that fails to reach
AAA Cooper is sent once more within the budget.

The site only answers from the Americas; elsewhere the connection times out before any reply.
The host supplies a fetcher routed through the United States. The adapter owns no proxy
credentials.

The page must name the PRO number asked. "PRO NOT FOUND IN SYSTEM" is the only missing
shipment. "PRONUMBER FOUND, PROCESS PENDING. CHECK BACK LATER" says AAA Cooper knows the number
and has nothing to show yet, so it is no history with the reason `listed`. Neither notice names
a number. Other notices, redirects, block pages and HTTP errors keep their own failure kinds.

## Numbers

PROs are eight digits. Older links and archived lookups also give nine: the eight and a Luhn
check digit, which every public nine-digit sample passes. The page drops a ninth digit without
checking it and shows the eight-digit PRO, so the adapter checks the digit before asking for
the eight. Anything else is invalid without a request. Both lengths are shared by many
carriers, so no rule claims them; a caller names the carrier or pastes a tracking page link.

## Links

AAA Cooper's Action Trac page opens one shipment at
`aaacooper.com/workspace/action-trac?id={number}&PG=ProNumber`. Older links put the PRO in
`ProNum` on `Transit/ProTrackResults.aspx`, with or without a `pwb/` prefix. The library reads
the number from each form.

## Notes

- Each tracing row has a day, a time and a sentence that names the place: the pickup or
  delivery town and state, or the service center the freight arrived at or departed. The place
  is read from the sentence, which is kept whole. The page lists the newest row first.
- Clocks carry no zone and stay local times; the terminals span the Eastern and Central zones.
- The status field settles a delivery, a return or a problem, and a shipment without a staged
  row. Otherwise the newest staged row is ahead of it.
- Before the delivery, the delivery field can hold a day, perhaps the one the shipment is due.
  It is not read and is named in `unread_estimates`.
- Who signed, the BOL and PO numbers, the service centers and their phones, the payment terms,
  the pieces and the weight are not read. Freight details, images and documents need an account.
- Action Trac, the site's newer tracker, is a WebAssembly app whose settings configure
  reCAPTCHA Enterprise; the results page needs neither.

## Limitations

After repeated lookups from one address in a short time, the page asks for the code of a
Telerik image CAPTCHA in place of any answer, the shipment's or a notice. The adapter reports it
as a challenge and does not solve it. No page of a shipment still moving was seen live; the
status field's wording before the delivery comes from an archived page. Scans have no offset
and no estimated delivery is read.

## Live test

Set private `AAA_COOPER_TRACKING_NUMBER` and `AAA_COOPER_PROXY_URL` (a US proxy), then run
`npm run test:carriers:live -- carriers/aaa-cooper/adapter.live.test.ts`.
