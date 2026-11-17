# Cristao Shipping & Marine Logistics

Cristao Shipping & Marine Logistics shipments use enabled universal providers. There is no
dedicated adapter.

Cristao Shipping & Marine Logistics is a freight forwarder in Trinidad and Tobago. It moves air and
ocean freight into and out of Trinidad, from parcels to full and part container loads, and
consolidates cargo at warehouses abroad. Its site is cristaoshipping.com.

## Numbers

Its tracker takes shipment numbers, up to twenty-five at once. No public page shows one, so there
is no rule.

## Why there is no adapter

Its tracker is GETOnline's, on the Frontier Force host that serves other couriers under their own
`stid`, as for [SkyNet Worldwide Express](../skynet-worldwide/README.md). No public number is known
to check its replies against.

## Links

The tracker opens one shipment at `tracking.frontierforce.com/go/plm-tracking` with the number in
`cn` and `stid=cristao`. On that host the library reads `cn` only when `stid` is `cristao`.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
