# Peqasus

Peqasus parcels use enabled universal providers. There is no dedicated adapter.

## Numbers

The only layout seen is three letters GBS followed by ten digits, the example Peqasus prints in
its own tracking field and empty-state card. One example cannot show that the prefix belongs to
Peqasus alone rather than to a partner line, so no rule claims it and detection leaves it
unclaimed by design.

## Retrieval lead

`peqasus.az/search?lang=en&parcel_tracking_number={code}` renders the answer on the server, without
a challenge: the parcel code, an onward tracking number, the weight and a five-step bar from
Registered to Delivered, with no dated statuses. An unknown code shows a "Parcel not found" card.
No reply with dated statuses has been seen, so there is no adapter.

## Links

The tracking form sends the code by GET to the search page in the parcel_tracking_number
parameter, with the page language in lang, so that address opens one parcel.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
