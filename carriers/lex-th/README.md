# LEX Thailand

LEX Thailand parcels use enabled universal providers. There is no dedicated adapter.

LEX is the Lazada marketplace's delivery network. In Thailand its site is lex.th; LEX Malaysia,
LEX Indonesia and LEX Vietnam are separate entries.

## Numbers

Its tracking page takes up to ten numbers. No public page shows one, so there is no rule.

## Why there is no adapter

No public number is known to check its tracker's replies against. The tracking page is the
Lazada app LEX Malaysia's site runs: it posts the numbers as a `trackingNumbers` list to
`lex.th/api/search_packages`. LEX Indonesia's and LEX Malaysia's adapters share a client
([lex.ts](../lex-id/lex.ts)) that this site can join once a found reply is seen. The page loads
Lazada's LWSC security script, which can answer with a slider CAPTCHA.

## Links

The tracking page opens numbers from its `references` parameter, a comma-separated list.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
