# itide

itide parcels use enabled universal providers. There is no dedicated adapter.

itide is a Norwegian courier and freight company at Borgeskogen in Stokke, Vestfold, with a branch
at Alnabru in Oslo. It carries express and courier shipments, parcels and general cargo, and offers
warehousing and third-party logistics.

## Numbers

The tracking form's example is a seventeen-digit number. Plain digits are shared with many
carriers, so there is no rule.

## Why there is no adapter

Its tracker is an Opter track-and-trace page, as [Cargobus's](../cargobus/README.md) is: the page's
script reads a shipment with `GET /tt/api/internal/<number>`. No public number is known to check its
replies against.

## Links

The Spor en sending form on itide's site sends the number to its Opter tracking page at
`itideno.opter.cloud`, where `/tt?keyword=<number>` opens one parcel. Opter hosts many carriers, so
only itide's subdomain is read.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
