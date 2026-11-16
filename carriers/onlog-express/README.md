# Onlog Express

Tracks Onlog's own posting references through its public guest tracker. Onlog's franchise
and forwarding network is separate from the carriers that perform a later delivery leg.

## Retrieval

The [official site](https://onlogexpress.com.br/) opens a share link on `onlog.app.br`.
The scoped TRAWL helper uses that tracker's canonical page on `conecta.log.br`, installs its
observer before navigation and fills one whole reference. It uses the number-only guest form;
the CPF/CNPJ and account branches are separate.

The page owns Turnstile and its tracking request. Its asynchronous script can load before
its initialization callback exists, leaving an empty widget. The helper invokes the existing
callback once in the page context when that happens, then permits bounded native checkbox
interaction. It waits for the tracking reply after submitting, including delayed native XHR,
and reserves time to close its fresh context. Refused verification keeps provider fallback.

The reply must name the whole reference beside its dated history. Only the explicit native
negative is not-found; generic errors, missing captures, blocked HTML and incomplete replies
stay distinct. The parser keeps the carrier's minute-precision wall clocks without assigning
a national offset. It projects scan wording and locations, omitting party fields and document
links. An internal object alias or a displayed operator name does not establish a different
tracking issuer or a handoff.

Shared clock resolution can derive an instant from a scan's place or neighbouring scans.
It retains the source wall clock and annotates how the zone was chosen.

## Recognition

Number detection offers a candidate with low confidence. HTTP recognition remains HTTP-only;
optional browser recognition confirms the same whole reference with dated native activity.
Other carriers' identifiers retain their issuer rules. Samples and provenance are in
[`numbers.json`](numbers.json).

## Testing

`npm run test:carriers:live -- carriers/onlog-express`, with `ONLOG_EXPRESS_TRACKING_NUMBER`
and `ONLOG_EXPRESS_UNKNOWN_NUMBER` supplied outside Git. Use the compatible TRAWL service
with the Onlog Express helper.
