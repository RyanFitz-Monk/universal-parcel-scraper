# Svenns Transport

Svenns Transport parcels use enabled universal providers. There is no dedicated adapter.

Svenns Transport is a Bodø carrier for transport and storage, express, import and export, and
moving.

## Numbers

No public page shows a Svenns Transport number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /tt/api/internal/<number>`. No public number is known to
check its replies against.

## Links

The site's Sporing link opens the Opter tracking page of Svenns Transport at
`svennsno.opter.cloud`, where `/TT?keyword=<number>` opens one parcel. Opter hosts many carriers, so
only its subdomain is read.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
