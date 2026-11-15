# Primewell

Primewell parcels use enabled universal providers. There is no dedicated adapter.

Primewell Courier, run by Primewell Management Ltd in the Nicosia district, delivers for companies
and online shops across Cyprus, runs a line to Greece and books air and sea freight. It holds a
general postal authorisation from OCECPR.

## Numbers

No public page shows a whole number or its layout, so there is no rule.

## Why there is no adapter

The tracker at `tracking.primewell.cy/OD_WEB_APP_EX/Track.aspx` ("Track & Trace Core BMS", shared
courier software) is an ASP.NET page that puts a session in its address and takes the number through
a form postback. With no public number to check its replies against, there is no adapter.

## Links

The tracker takes numbers only through its form, so no address opens one shipment.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
