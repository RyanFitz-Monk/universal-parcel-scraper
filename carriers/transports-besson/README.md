# Transports Besson

Transports Besson parcels use enabled universal providers. There is no dedicated adapter.

Transports Besson, of Vaulx-en-Velin near Lyon, founded in 1908, delivers pallets and parcels
(messagerie) in cities and their outskirts, with agencies in the south-east and around Paris and
Lille. Its tracker asks for the shipment reference and the two-digit delivery département.

## Numbers

The tracker asks for a reference of fourteen digits. No public page shows one, so there is no
rule.

## Why there is no adapter

The home page's form posts the reference as `p` and the département as `cp` to
`/Lug?controller=position/DetailPosition`. No public reference is known to check its replies
against.

## Links

The tracker takes the reference only with the département in a form post, so the catalog sends
people to the home page.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
