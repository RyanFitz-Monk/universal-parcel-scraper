# CTL Cargo Trans Logistik

CTL Cargo Trans Logistik parcels use enabled universal providers. There is no dedicated adapter.

CTL Cargo Trans Logistik AG, of Homberg (Efze), runs a network of partner forwarders for general
cargo in Germany and Europe. Each partner collects and delivers in its own area. Its site is
ctl-ag.de.

## Numbers

The tracking box on ctl-ag.de asks for a 20-digit CTL shipment number. Twenty digits fit many
other carriers' numbers, and no public page shows one, so there is no rule.

The short name "CTL" is not an alias, because other companies, such as the Polish rail freight group
CTL Logistics, use it too.

## Why there is no adapter

Its tracker is an ASP.NET page, and no public number has been found to check a found reply with.

## Links

The tracking box on ctl-ag.de opens the tracker with the number in `snr`, and the library reads
the number from that address.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
