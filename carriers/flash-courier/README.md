# Flash Courier

Flash Courier parcels use enabled universal providers. There is no dedicated adapter.

Flash Courier is a São Paulo courier founded in 1993. It delivers bank cards, contracts, documents
and parcels across Brazil through its own branches and franchises.

## Numbers

Its tracker takes a tracking code or HAWB of up to twenty letters and digits. It also finds a parcel
by the sender's own code: its client API looks shipments up by `numEncCli`, as
[E-Com Plus's integration](https://github.com/ecomplus/cloud-commerce/blob/main/packages/apps/flash-courier/lib-mjs/update-tracking.mjs)
shows. A sender's code can copy the postal S10 layout with a suffix that names no country, which the
international mail rule leaves out. No public page shows a Flash Courier number, so there is no rule.

## Why there is no adapter

The tracking page asks for an image CAPTCHA before it shows a history, and for an SMS code or the
recipient's name before it shows personal details. No public number is known to check its replies
against.

## Links

The site's tracking box opens `/rastreio/<number>`, and the library reads the number from that
address.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
