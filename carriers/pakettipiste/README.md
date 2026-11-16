# Pakettipiste

Pakettipiste parcels use enabled universal providers. There is no dedicated adapter.

Pakettipiste is Lehtipiste Oy's nationwide Finnish network of pickup points and parcel lockers,
with morning delivery to the lockers up to six days a week.

## Numbers

The tracker takes a tracking ID of up to 35 characters, and its example has nine digits. The pickup
code sent by text message is a separate eight-digit code. No public page shows a Pakettipiste
number, so there is no rule.

## Why there is no adapter

The tracker is an R2 Web ASP.NET page whose form posts the number as `txtTrackingId`. No public
number is known to check its replies against.

## Links

The tracker reads a number from its `tid` parameter.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
