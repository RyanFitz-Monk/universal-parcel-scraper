# Delibox

Delibox parcels use enabled universal providers. There is no dedicated adapter.

Delibox (딜리박스) is the last-mile delivery brand of the Korean newspaper JoongAng Ilbo, which wholly
owns its operator, 딜리박스중앙. It delivers for online shops, retailers and other carriers from the
newspaper's city distribution hubs, by motorbike and van, and also runs mid-mile transport. Its site
is dbox.co.kr.

## Numbers

Its tracker takes a waybill number. No public page shows one, so there is no rule.

## Why there is no adapter

No public number is known to check its tracker's replies against.

## Links

The tracking box opens `www.dbox.co.kr/delivery.php?laasInvcNo=<number>` in a pop-up, and the
library reads the number from `laasInvcNo`.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
