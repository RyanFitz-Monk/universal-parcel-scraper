# Transportes Condesa

Transportes Condesa parcels use enabled universal providers. There is no dedicated adapter.

Transportes Condesa, of Torreón, Coahuila, carries part and full truckloads and small "mini-pack"
parcels across Mexico, and stores goods. Its tracker is the box on its support page that asks
for a tracking code, under the heading "Consulta de Facturas".

## Numbers

No public page shows a Transportes Condesa tracking code, so there is no rule.

## Why there is no adapter

The box posts the code to `/api/Invoice` and then loads `/Home/Invoice?trackingCode=<code>`, an
HTML fragment it shows in a dialog. No public code is known to check its replies against.

## Links

The tracker takes codes only in its box, so the catalog sends people to the support page.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
