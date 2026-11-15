# Campost

Campost parcels use enabled universal providers. There is no dedicated adapter.

## Numbers

Campost, the Cameroonian postal service, gives letters, parcels and EMS items UPU S10 numbers
ending in `CM`. Generic postal detection handles these numbers, so no rule for Campost claims
them.

## Retrieval lead

The home page's tracking form posts the number to WordPress's `admin-ajax.php` as an Elementor form
(`form_fields[tracking_number]`), without a nonce or CAPTCHA token, and renders the JSON reply's
message as a tracking card. A number it holds nothing for answers "Aucune information trouvée". No
found reply has been seen, so there is no adapter.

## Links

The tracking form on campost.cm posts the number and has no address for one item.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
