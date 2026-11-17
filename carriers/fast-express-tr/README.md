# Fast Express

Fast Express parcels use enabled universal providers. There is no dedicated adapter.

Fast Express is a Turkish international courier. It sends documents and parcels abroad by air,
brings them into Turkey, and carries road freight to and from Europe through Istanbul customs. Its
site is fast-express.com.

## Numbers

The Consignment Inquiry box on its home page takes an air waybill number. No public page shows one,
so there is no rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Links

The box opens `www.fast-express.com/<language>/action/tracking/<number>`, with `tr`, `en`, `de`,
`es`, `fr` or `ru` as the language, and the library reads the number from that address.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
