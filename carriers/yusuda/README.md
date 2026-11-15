# Yusuda

Tracks shipments of Yusuda, 裕速达 (广州裕速达货运代理有限公司, Guangzhou Yusuda Freight
Forwarding), a Guangzhou forwarder selling small-parcel lines to the United States, Canada and
Europe and China Post services. Its site is ysdhy.cn.

## How it works

The site's tracking form opens `trackIndex.htm?documentCode=` on the Hualei (华磊) tracker at
`134.175.243.207:8082`, over plain HTTP. That is [GZYL's](../gzyl/README.md) tenant, so the
adapter is GZYL's with this carrier's id: the same requests, steps and not-found answer
([hualei.ts](../gzyl/hualei.ts)).

1. `direct`: one GET to `selectTrack.htm?documentCode=<number>`, then, when the interface holds no
   row for the number, one POST of the same `documentCode` to `trackIndex.htm`, which settles
   not-found.
2. `retry`: the same read once more after a request fails to reach the tracker or hangs.

## Notes

- The tracker writes GZYL's wordings, so GZYL's status map and row splitting read them, and GZYL's
  rows written ahead and scripted delivery row are held back here too.
- A not-found leaves the enabled universal providers to answer.

## Limitations

No public page shows a Yusuda number, so detection names no shape and the adapter answers when the
carrier is chosen or a universal provider names it. HTTP recognition does not ask it.

## Links

No portal link is published, since a plain-HTTP link would leave the number in the clear. The
canary takes HTTPS only, so it checks 17TRACK, not the tracker.

## Testing

Set `YUSUDA_TRACKING_NUMBER` (and `YUSUDA_UNKNOWN_NUMBER` for the not-found answer) outside the
repository and run `npm run test:carriers:live -- carriers/yusuda`.
