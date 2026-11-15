# KwickBox

KwickBox parcels use enabled universal providers. There is no dedicated adapter.

KwickBox is a Riyadh last-mile delivery and warehousing company.

## Numbers

Its API reference gives a twelve-digit shipment number. Twelve digits are common to many
carriers, so no rule claims them.

## Retrieval lead

The tracking box posts `{"number": number}` to `system.kwick-box.com/api/public/track`, without a
key. The page reads the shipment's reference, weight, description and `trackingEntries`, each a
date and a status code it turns into a title and message. An unknown number answers HTTP 400 with
`shipmenT_NOT_FOUND`, "No shipment with the specified query". No found reply has been seen, so
there is no adapter.

## Links

The tracking box on the home page sends the number to KwickBox's API and shows the history in
place, so no address opens one shipment.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
