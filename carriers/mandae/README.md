# Mandaê

Mandaê, also branded Nuvem Envio/Mandaê, ships Brazilian stores' parcels through partner carriers and
tracks them on Rastreaê. The adapter reads Rastreaê's record of one code through the TRAWL browser
service.

## Numbers

Mandaê's code is a four- or five-letter store prefix followed by the store's item number, six to
nine digits; older parcels have a bare number. Rastreaê also takes the partner carrier's code for
the parcel and answers it with Mandaê's record. The prefix belongs to the store, not to Mandaê, and
the shapes are shared with other carriers' references, so no rule claims them.

## Retrieval

Rastreaê's result page, `rastreae.com.br/resultado/{code}`, asks
`rastreae.api.mandae.com.br/v2/rastreamentos/{code}`. AWS WAF answers a call without its token with
a challenge (HTTP 202), which the page's script solves before asking again, so a plain HTTP client
gets no reply. TRAWL opens the page and captures that call's reply for the whole code. The former
`external/v1` API answers 404 for every code.

The reply holds the order's state (`situacaoEncomenda`), its milestones and its scans
(`historico`), each a short title, a sentence for the recipient and an instant with its offset. The
titles set the scans' stages. A state the tracker's script shows as finished or as a problem, such
as delivered, returned, lost or awaiting pickup, sets the parcel's stage when no scan says so; the
other states leave it to the scans. The promised arrival day (`dataChegadaVendida`) is the estimate
until delivery.

## Choices

- A reply is taken only for the code asked or for the partner code its hand-over scan names
  ("postada via … com o código …"); asked by the partner code, Mandaê's own code is the canonical
  number.
- A scan's instant keeps Rastreaê's offset and drops the milliseconds some scans carry.
- The sentences beside the titles, the partner's name and the milestones are not read: the
  milestones repeat the state and the scans, and the hand-over names the partner by an internal key.
- A 404 is Rastreaê's own "not found", which leaves the parcel's absence unproven; an order
  without scans is listed without history.

## Limitations

No public sample has shown a returned, lost or awaiting-pickup parcel, so those stages come from
the script's state names and no scan title for them is mapped yet. Partner hand-overs give no
delivery hand-off: the partner's code is Mandaê's key for it, not a number the partner's tracker
was seen to answer.

## Links

Rastreaê opens one parcel at `rastreae.com.br/resultado/{number}`. The former tracker used
`app.mandae.com.br/rastreamento/{number}`.

## Testing

`npm run test:carriers:live -- carriers/mandae` with `FLARESOLVERR_URL` and
`MANDAE_TRACKING_NUMBER` set outside the repository.
