# Post Anatolia

Post Anatolia parcels use enabled universal providers. There is no dedicated adapter.

Post Anatolia is an Ankara courier licensed by Turkey's regulator BTK. It works for business
senders: collection, delivery with an identity check, documents and returns.

## Numbers

No public page shows a Post Anatolia number, so there is no rule.

## Why there is no adapter

The tracker asks for the recipient's phone number beside the number, then posts both to
`api.postanatolia.net/common/cargo/track`. No public number is known to check its replies against.

## Links

The tracker fills in the number from its `trackingNumber` parameter and then asks for the phone
number.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
