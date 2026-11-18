# Flash Courier

The public guest tracker accepts Flash tracking numbers and sender-chosen customer references. These references have no exclusive number pattern; select the carrier or use its tracking link. HTTP-only recognition does not invoke the guest OCR service.

TRAWL opens a fresh anonymous HTTP cookie session, reads the official form and image generation endpoint, and solves the five-character image with its local CPU OCR. At most two fresh images and two submissions are used. No browser profile, account, SMS or recipient information is needed. Ambiguous matches and empty histories stay inconclusive; only the explicit whole-reference missing reply establishes absence.

The helper projects shipment identity, status and scan clocks. The adapter preserves offset-less wall times because the history states no zone. The shared result finisher can date them using the catalog's carrier clock and records that inference beside the original wall time. The primary tracking code is checked alongside the labelled customer reference; an unconfirmed alias does not replace the requested reference.

```sh
FLASH_COURIER_TRACKING_NUMBER=... TRAWL_URL=... npm run test:carriers:live -- carriers/flash-courier
```
