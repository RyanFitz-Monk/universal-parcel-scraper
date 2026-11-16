# Correos de Nicaragua

Correos de Nicaragua parcels use enabled universal providers. There is no dedicated adapter.

## Numbers

Correos de Nicaragua gives letters, parcels and EMS items UPU S10 numbers ending in `NI`.
Generic postal detection handles these numbers, so no rule for Correos de Nicaragua claims
them. Its small-packet and parcel lookups take other references, such as a receipt number,
which stay unclaimed.

## Links

The tracker on rastreo.correos.gob.ni posts the number and has no address for one item.

## Why there is no adapter

The [official tracker](https://rastreo.correos.gob.ni:8084/SICRastreo) posts `codigo`
and `g-recaptcha-response`, then renders the result on the server. Without accepted
verification, its generic "El parametro enviado es inválido" response cannot establish
that a parcel is missing. Its small-packet and parcel lookups carry the same checkbox.

An adapter needs accepted verification and a dated history response bound to the whole
number before its parser and negative-result contract can be established. A guest mobile
route has not been established.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
