# Shree Mahavir Express Services

Shree Mahavir Express Services parcels use enabled universal providers. There is no dedicated
adapter.

Shree Mahavir Express Services is a domestic courier with regional offices in Ahmedabad,
Mumbai, Indore and other cities of western and central India.

## Numbers

Shree Mahavir consignment numbers are twelve digits, seen in archived lookups on its own
tracker. No rule claims them, since many carriers print twelve-digit runs.

## Retrieval lead

The home page's tracking form posts the number to `Index.aspx` as `txtAWBNo` with `cmdTrack`,
which redirects to `Frm_DocList.aspx` with the number encrypted by the server; that page frames
`Frm_DocTrack.aspx` with each number in that form. The frame shows the number, from and to centre,
date, receiver and status, then transit and delivery rows. The public samples show the number with
empty fields, or the origin centre and an office contact in place of a status, without rows, so
there is no adapter.

## Links

Archived lookups open one consignment at `www.shreemahavircourier.com/Frm_DocTrack.aspx?docno=`
followed by the number, and the company's other site, `smespl.in`, has the same page as
`Frm_DocTrackWeb.aspx`. The number is read from both. The page now takes only the number the
server encrypted and sends a plain one to `_NotAvailable.aspx`.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
