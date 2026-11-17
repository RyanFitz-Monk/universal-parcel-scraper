# Xindus

Xindus parcels use enabled universal providers. There is no dedicated adapter.

Xindus Trade Networks, of Gurugram and Jaipur, consolidates exports from India: parcels by air,
freight by air and sea to the United States and the United Kingdom, and stock for Amazon's
warehouses. Its site is xindus.net.

## Numbers

Its tracker takes an air waybill number or an order reference. No public page shows one, so there
is no rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Leads

The tracker's script looks the number up with
`GET https://os.xindus.net/ixos-service/oapi/shipment-tracking/shipment?scancode=<number>`.

## Links

`www.xindus.net/tracking?awb=<number>` looks the number up on load, and the library reads the number
from `awb`.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
