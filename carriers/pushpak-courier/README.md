# Pushpak Courier

Pushpak Courier parcels use enabled universal providers. There is no dedicated adapter.

Pushpak Courier is a domestic courier network based in Jaipur, India, with its largest
network in Rajasthan.

## Numbers

Complaints give consignment numbers of five, six and eight digits, and one of three letters
and seven digits. None of these shapes points to Pushpak alone, so no rule claims them.

## Retrieval lead

`query.php` takes a form POST of `trackcode` and `IDType` (`Doc_No` for a consignment number,
`Ref_No` for a reference) and answers on the same page, without a challenge. A number it does
not show reads "Document Not Found". No found reply has been seen, so there is no adapter.

## Links

The tracker posts its form, so no address opens one parcel.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
