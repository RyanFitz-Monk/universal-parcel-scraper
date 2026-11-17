# Poșta Moldovei

Poșta Moldovei items, tracked through the call that the official
[tracking page](https://posta.md/ro/track-trace) makes, run in the TRAWL browser service. The
tracker holds Poșta Moldovei's own items and mail from abroad under the sending post's number.

## How it works

1. `trawl`: TRAWL opens `posta.md/en/track-trace/mailing/{number}` (tiers 2–3, no plain HTTP).
   The page runs a Cloudflare Turnstile check and then calls
   `GET https://trimiteri-api.posta.md/public/track/{number}` with the check's token in a header.
   TRAWL captures that reply. Only a capture whose URL is exactly that address, with nothing
   added, counts.

Budget: 45 s by default (max 60 s), including the TRAWL transport allowance.

## Notes

- A page that sends no tracking call failed its Turnstile check, which is a challenge. On the
  capture, 401/403 is a challenge, 429 is rate limited (honours `Retry-After`) and other errors
  are upstream failures.
- `404 "Not found."` answers both an item the tracker does not hold and a call whose Turnstile
  token it refused, so it is `no_history` with no reason. An item with no scans is `no_history`
  with `portal_not_found`. Neither confirms an absence.
- `shipping_logs` lists the scans, newest first. A scan's wording is English or Romanian, with or
  without diacritics, and the sending post's scans come in UPU's English with an `(Otb)` or
  `(Inb)` suffix. There is no event code, so the wording sets the stage; a wording the map does
  not know goes through the shared wording rules and otherwise stays unclassified.
- `created_at` ends in `Z`, but it is the scanning office's wall clock less two hours. A July
  delivery attempt that Poșta Moldovei dates by day reads 22:00 the evening before, when Moldova
  is three hours ahead of UTC. The adapter adds the two hours back and keeps the result as the
  scan's wall clock, with no instant. The sending post's scans keep its clock.
- `additional_description` is the place: a country and office, or an office's postcode.
- Some replies carry the sender's and recipient's names and the weight. The adapter reads none
  of them.

## Limitations

- The tracker has no ETA, service, origin, destination or delivery instant with a zone.
- Each lookup needs TRAWL to pass the Turnstile check.
- Curier Rapid items use another API (`curier-rapid-api.posta.md`), which the adapter does not
  call.

## Numbers

Poșta Moldovei's tracking page describes three layouts. International items carry UPU S10
numbers, which generic postal detection handles. Domestic items carry fourteen characters that
start with `D` and end in `RC`, `RR`, `CC`, `AS` or `AR`; the ones seen are `D`, a letter and
ten digits, which `posta-moldovei-1` claims. Curier Rapid items carry thirteen characters; the
only sample is the page's own example, a letter pair and eleven digits, which no rule claims
because other carriers print that shape.

The adapter takes S10 codes with a valid check digit and the domestic layout; anything else is
invalid without a request. An S10 item that another post or a provider reports bound for Moldova
is handed here. The samples and their sources are in [`numbers.json`](numbers.json).

## Links

The tracker opens one item at `posta.md/{language}/track-trace/mailing/` followed by the
number, as archived lookups show. The former tracker took the number from `id` on
`posta.md/{language}/tracking`.

## Testing

`npm run test:carriers:live -- carriers/posta-moldovei` with `FLARESOLVERR_URL` and
`POSTA_MOLDOVEI_TRACKING_NUMBER` set outside the repository.
