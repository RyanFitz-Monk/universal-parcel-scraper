# Hartmann International

Hartmann International parcels use enabled universal providers. There is no dedicated adapter.

Hartmann International is a German forwarder in Paderborn and Ibbenbüren: groupage, part and full
loads, European road transport, and air, sea and rail freight.

## Numbers

The tracker finds a shipment by package number (Collinummer), by depot and shipment number, or by
customer order number. Its example package number is a 20-digit SSCC, a layout many forwarders
share, so there is no rule.

## Why there is no adapter

The tracker posts its form to `cp.hartmann-international.de/Track` and answers with an HTML page.
No public number is known to check its replies against.

## Links

The tracker takes numbers only in its form, so the catalog sends people to the tracking page.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
