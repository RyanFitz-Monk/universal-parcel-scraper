# Chic Express

Chic Express parcels use enabled universal providers. There is no dedicated adapter.

Chic Express (起客国际物流) is a Hangzhou forwarder that ships parcels and freight from China to the
Gulf states and the wider Arab world by air and sea, duties paid, and runs overseas warehouses.

## Numbers

No public page shows a Chic Express number, so there is no rule.

## Why there is no adapter

The tracking page reads `GET /api/common/v1/tracking/query/<number>` on its own host. No public
number is known to check its replies against.

## Links

The tracking page reads numbers from its `s` parameter. Its address keeps the trailing slash:
without it the site redirects to plain HTTP.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
