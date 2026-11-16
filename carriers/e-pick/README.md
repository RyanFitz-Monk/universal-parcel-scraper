# E-Pick

E-Pick parcels use enabled universal providers. There is no dedicated adapter.

E-Pick is an Argentine last-mile courier for online shops. Its own fleet collects in Buenos Aires,
Córdoba and Rosario, and it delivers across the country, handing some parcels to other carriers.

## Numbers

Its tracker takes an operation number of five to thirty letters and digits. No public page shows an
E-Pick number, so there is no rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Links

`app.e-pick.com.ar/seguimiento?codigo=<number>` looks one number up, and the library reads the
number from that address and from the `code` and `c` parameters the page also reads.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
