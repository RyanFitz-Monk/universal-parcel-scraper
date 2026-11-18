# Paxel

The adapter uses the [public tracking form](https://paxel.co/id/lacak-pengiriman)
through TRAWL, including its browser verification and session form token. It reads
the response to the form's whole AWB submission, rather than a rendered page prefix.

The timeline keeps its native order and its yearless source clocks. It does not
infer a year, time zone or delivery estimate. The answer remains partial so enabled
providers can supplement it with richer dated history. Courier names, recipient
details and delivery proof stay out of the result. An invalid-AWB notice is
inconclusive about shipment existence.

Run the live tests with `npm run test:carriers:live -- carriers/paxel`.
