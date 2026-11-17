# Aloha Freight

Aloha Freight shipments use enabled universal providers. There is no dedicated adapter.

Aloha Freight Forwarders ships less-than-truckload freight by sea between the US mainland and
Hawaii, Alaska and Guam, through terminals in Carson, California, Tacoma, Washington and Honolulu.

## Numbers

Its Quick Shipment Search takes a freight bill (PRO), invoice or quote number. No public page
shows one, so there is no rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Leads

The search on `www.alohafreight.com/portal/` needs no login. Its script posts
`task=shipments/lookup` with the number as `keyword` to `/portal/ajax.php`, and the JSON reply
gives the vessel and voyage and the sailing, unloading, arrival, appointment and delivery dates.

## Links

The search answers only by POST, so no address opens one shipment.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
