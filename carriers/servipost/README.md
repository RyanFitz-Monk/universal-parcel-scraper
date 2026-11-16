# ServiPost

ServiPost parcels use enabled universal providers. There is no dedicated adapter.

ServiPost (Valenciana de Notificadores, Valnot) is a private postal operator in Paterna, Valencia,
with offices in Castellón and the Canary Islands. It delivers administrative notifications,
certificates and census letters for councils and companies.

## Numbers

The tracker reads the code printed on the notice left for the recipient. No public page shows
one, so there is no rule.

## Why there is no adapter

The tracker is a Livewire form: a lookup posts the page's component state back, so a number
cannot go in the address. It shows the latest status only. No public code is known to check its
replies against.

## Links

The tracker takes numbers only in its form, so the catalog sends people to the tracking page.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
