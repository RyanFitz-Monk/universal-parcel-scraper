# FREJA

FREJA parcels use enabled universal providers. There is no dedicated adapter.

FREJA is a privately owned Danish transport and logistics company in Skive, founded in 1985, with
branches in Denmark, Sweden, Norway, Finland, Poland and China. It runs road transport, sea and air
freight, project forwarding and contract logistics.

## Numbers

The road tracker looks a number up as a FREJA transport ID first and then as an SSCC. SSCCs are
shared by many carriers, so there is no rule.

## Why there is no adapter

The road tracker's script posts the number to `tid_script.php` in the site's theme and falls back
to `sscc_script.php`; both answer with JSON. Sea and air freight are tracked on a separate page. No
public number is known to check its replies against.

## Links

The road tracker reads a number written right after `?` in its address and searches on load.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
