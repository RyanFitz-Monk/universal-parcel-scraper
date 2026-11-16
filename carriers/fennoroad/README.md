# FennoRoad

FennoRoad parcels use enabled universal providers. There is no dedicated adapter.

FennoRoad is a chain of Finnish transport companies, run by Fenno Road Oy from a terminal in
Vuosaari, Helsinki, that carries groupage and parcels to every postcode in Finland.

## Numbers

The tracker searches by waybill, package, order number or the sender's or receiver's reference. No
public page shows one, so there is no rule.

## Why there is no adapter

The tracker is FennoRoad's tenant of the KuljetusVelho track-and-trace service, chosen by
`env=froad` in its address. The page's script reads a shipment from the same address with `ajax=1`,
an action and the search type. No public number is known to check its replies against.

## Links

The page can open with a search filled in, but the parameters it reads for that are not known, so
the catalog sends people to the tracking page.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
