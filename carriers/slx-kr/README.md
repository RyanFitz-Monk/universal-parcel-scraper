# SLX

SLX parcels use enabled universal providers. There is no dedicated adapter.

SLX (에스엘엑스택배) is a Korean parcel courier based in Icheon, Gyeonggi, with next-day and
same-day delivery. It is not the Chinese carrier of the same initials.

## Numbers

The tracking page's script asks for a waybill of 10 to 13 digits. No public page shows an SLX
number, and Korean couriers share that shape, so there is no rule.

## Why there is no adapter

The tracker is a server page on `net.slx.co.kr`. Without a number it answers HTTP 500, so the
catalog's health check reads the tracking form instead. No public number is known to check its
replies against.

## Links

The tracking form opens `net.slx.co.kr/info/tracking.jsp?iv_no=<number>`; the catalog reads the
number from `iv_no`.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
