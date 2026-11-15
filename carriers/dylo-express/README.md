# Dylo Express

Dylo Express parcels use enabled universal providers. There is no dedicated adapter.

Dylo Express is a courier in Nuevo León that carries parcels, consolidated loads and full trucks
across Mexico with its own drivers. Its tracker shows the carrier and service beside a guide's
statuses, so some guides travel with partners.

## Numbers

The tracker's field shows `DYL-` and eight digits as its example. No public page shows a whole
guide, so there is no rule.

## Why there is no adapter

The tracker is a single-page app whose script asks `GET /analytics-api/tracking/<guide>` on its own
host. No public guide is known to check its replies against.

## Links

The tracker reads no guide from its address, so the catalog sends people to the tracking page.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
