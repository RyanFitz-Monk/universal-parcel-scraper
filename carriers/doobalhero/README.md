# Doobalhero

Doobalhero parcels use enabled universal providers. There is no dedicated adapter.

Doobalhero (두발히어로) is Chainlogis's same-day courier for online sellers in Seoul, Gyeonggi and
Jeju, with deliveries within hours and returns.

## Numbers

The tracker takes a booking number (접수번호) of letters and digits. No public page shows one, so
there is no rule.

## Why there is no adapter

The tracker is a single-page app that reads a delivery from
`noritake-external.prod.doobalhero.kr/public/deliveries/<number>`. No public number is known to
check its replies against.

## Links

The tracker reads a number from its `bookId` parameter.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
