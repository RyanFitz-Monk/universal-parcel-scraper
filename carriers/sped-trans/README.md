# Sped Trans

Sped Trans parcels use enabled universal providers. There is no dedicated adapter.

Sped Trans is a transport and forwarding company in Fredrikstad with customs clearance and a
terminal at Borg Havn, for general cargo, part loads, dangerous goods and courier vans.

## Numbers

No public page shows a Sped Trans number, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /opter/tt/api/internal/<number>`. No public number is known to
check its replies against.

## Links

The site's Sporing link opens the Opter tracking page of Sped Trans over HTTP; the catalog uses its
HTTPS address at `amp.andmork.com`, where `/opter/tt?keyword=<number>` opens one parcel.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
