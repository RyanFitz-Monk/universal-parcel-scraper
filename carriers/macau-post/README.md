# Macao Post

Macao Post parcels use enabled universal providers. There is no dedicated adapter.

Macao Post (澳門郵政, Correios de Macau) is run by Macao's Post and Telecommunications Bureau
(CTT), a government bureau. Its site is ctt.gov.mo.

## Numbers

Macao Post gives registered items, parcels and EMS items UPU S10 numbers ending `MO`, as its
tracking page's examples show. Generic postal detection handles these numbers, so no rule for
Macao Post claims them.

## Why there is no adapter

The tracking page shows an image code but checks it only in the browser. Its data comes from an
open JSONP service that answers without a session: `GetRMTrace2JSON` under
`https://www.ctt.gov.mo/CTTServices/Service.asmx/`, asked with the number as `itemno`, the
language as `opt` and a `callback`. For an item it does not know, its `message` says the item is
not found. The page's script reads a found item's scans from `result[].events[]`, each with a
description, an office and its instant as `/Date(milliseconds)/`. It holds no list of event
codes, so stages would come from the wording. No public number has shown a known item's reply
yet. Macao S10 numbers reach the generic postal entry, so an adapter also needs an S10 rule of
its own to be asked.

## Links

The tracking page looks numbers up in place, so no address names one item.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
