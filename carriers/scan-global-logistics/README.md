# Scan Global Logistics

Scan Global Logistics parcels use enabled universal providers. There is no dedicated adapter.

Scan Global Logistics is a Danish freight forwarder with offices in Europe, the Americas and
Asia-Pacific, for air, sea and road freight.

## Numbers

Its public tracker takes a booking id; a second tracker, TranStatus, takes air and sea waybills,
container numbers and references. No public page shows one, so there is no rule.

## Why there is no adapter

The tracker at `tracking.scangl.com` reads a booking from `tracking-api.scangl.com/api`. No public
booking id is known to check its replies against.

## Links

`tracking.scangl.com/<booking id>` opens one booking; the tracking box on the site builds the same
link.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
