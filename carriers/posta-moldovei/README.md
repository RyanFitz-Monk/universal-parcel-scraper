# Poșta Moldovei

Poșta Moldovei parcels use enabled universal providers. There is no dedicated adapter.

## Numbers

Poșta Moldovei's tracking page describes three layouts. International items carry UPU S10
numbers, which generic postal detection handles. Domestic items carry fourteen characters that
start with `D` and end in `RC`, `RR`, `CC`, `AS` or `AR`; the ones seen are `D`, a letter and
ten digits, which `posta-moldovei-1` claims. Curier Rapid items carry thirteen characters; the
only sample is the page's own example, a letter pair and eleven digits, which no rule claims
because other carriers print that shape.

## Links

The tracker opens one item at `posta.md/{language}/track-trace/mailing/` followed by the
number, as archived lookups show. The former tracker took the number from `id` on
`posta.md/{language}/tracking`.

## Why there is no adapter

The tracker asks for a Cloudflare Turnstile confirmation before it shows an item's history; its
settings carry the Turnstile site key and its wording says the history needs the confirmation.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
