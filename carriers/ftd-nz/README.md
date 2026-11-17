# FTD New Zealand

Reads FTD's New Zealand forwarder timeline and its named ZTO handoff through the
[official guest tracker](https://www.ftd.nz/query/).

`direct` requests `query/?code=` with the whole reference. `retry` repeats only a
network failure within the lookup budget. No account, phone or CAPTCHA is needed.
The result heading, timeline id and screenshot target must identify the same shipment;
the downstream reference must agree in the timeline id and named carrier notice.

Native order establishes progression across New Zealand and China. Scan clocks stay
local, with their stated places retained. Undated downstream lookup failures are omitted
from the scans. The forwarder history stays incomplete so richer provider history and a
confirmation handoff remain available. The generic empty-form absence text is unbound
and stays inconclusive.

Only the view with a bound ZTO handoff is supported. Other layouts need a separate
control. The short numeric reference with its letter prefix does not establish ownership
and supplies no number-only recognition.

`FTD_NZ_TRACKING_NUMBER=<public sample> npm run test:carriers:live -- carriers/ftd-nz`
