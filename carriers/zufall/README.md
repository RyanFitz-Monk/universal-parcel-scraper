# ZUFALL

ZUFALL parcels use enabled universal providers. There is no dedicated adapter.

ZUFALL is a family-run German forwarder founded in 1928, based in Göttingen with other sites across
Germany. It runs road groupage and express, sea and air freight, rail to China and contract
logistics, and is a [Night Star Express](../night-star-express/README.md) partner.

## Numbers

For road freight the tracker takes a ZUFALL shipment or order number, a tracking number or an SSCC
(NVE); air freight adds the air waybill, and sea freight the container or bill of lading. No public
page shows a ZUFALL number, so there is no rule.

## Why there is no adapter

The ZUFALLconnect tracker sends the recipient's name, the reference and the mode of transport to
`/api/shipment/anonymous-shipment-search/` and opens the link it gets back. No public number is
known to check its replies against.

## Links

The tracker asks for the recipient's name with the number, so the catalog sends people to the
tracking page.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
