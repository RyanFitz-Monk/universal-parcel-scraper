# ANE Logistics

Tracks ordinary domestic ANE freight waybills through its official guest API.

## How it works

`direct` posts the whole `billNo` to
`https://www.ane56.com/gw/api/order/v2/searchWayBillByNo`, with the public detail
page as referrer. The site offers Tencent verification, but this guest read needs
no CAPTCHA ticket, account, cookie or bootstrap session.

Both `data[].billno` and `wayBillInfo.ewbNo` must name the whole requested waybill.
Scans keep `operateTime` as a local wall clock. Response construction time is not a scan.
The adapter keeps the scan code, category and city; free-form staff/contact descriptions,
addresses, signatures and delivery documents are excluded.

## Limitations

The ordinary `scanList` is partial. PDD (`ecId: 398` / `scanListPDD`) uses another
history contract and remains with enabled providers. Unmapped codes keep their code
without an invented stage; signed-delivery semantics are not inferred from them.
Empty replies stay inconclusive. Shared numeric formats do not establish ownership;
explicit selection or a named handoff is required.

No distinct official Android guest protocol is needed for this web read.

## Testing

`npm run test:carriers:live -- carriers/ane-logistics`
