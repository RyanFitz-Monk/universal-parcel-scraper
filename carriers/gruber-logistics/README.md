# GRUBER Logistics

GRUBER Logistics S.p.A. is a road haulier and forwarder in Ora (Auer), South Tyrol, with full and
part loads, groupage, heavy transport, air and ocean freight, and offices across Europe. Its site is
gruber-logistics.com.

## Numbers

Public examples are twelve characters: two letters or digits, then ten digits. Only an aggregator's
examples show them, so there is no rule; the adapter answers an explicit selection.

## Retrieval

The tracker at `glapptracking.gruber-logistics.com` is a single-page app. It reads its gateway and
the key it gives every visitor from its own `config.json`, then asks the gateway for
`tracking/v1/tracking/order/<number>` with that key in `x-apikey`. The adapter does the same on
each lookup, sends the key only to a GRUBER host over HTTPS, and requires the reply's `id_tracking`
to be the number asked.

The page reads HTTP 404 as an unknown number, 406 as a shipment too old to show and 422 as data it
cannot get; the adapter reports them as not found, an expired history and an inconclusive answer.
The gateway also answers a route it does not have with 404 and `Cannot GET`, which the adapter
reports as a failure. A reply with `redirectUrl` sends the page elsewhere and is inconclusive.

The reply lists events oldest first. Each has a code, an Italian description, a time with its
offset and a place. The adapter names each code as the page does, in English, Italian or German
for the reader, and falls back to the description for a code the page does not name. Events still
expected carry only a planned time and are left out; a shipment without any other event is listed
without history. The stops, references, documents and goods are left out.

## Stages

The page's names stage the codes: pickup and loading as accepted, warehouse, hub, partner and
terminal events as in transit, the deliveries (including a direct load's unloading at its delivery
stop) as delivered, failed or refused deliveries as failed attempts, and incidents, damage,
held stock and cancellations as exceptions. Driver and trailer steps, failed pickups, bookings and
the closing of held stock move nothing; [statuses.json](statuses.json) records each.

## Links

`glapptracking.gruber-logistics.com/?trackingId=<number>` opens one shipment. The corporate site
does not link the tracker.

## Testing

`GRUBER_LOGISTICS_TRACKING_NUMBER=… GRUBER_LOGISTICS_UNKNOWN_NUMBER=… npm run test:carriers:live -- carriers/gruber-logistics`
