# Vestovoy

Vestovoy parcels use enabled universal providers. There is no dedicated adapter.

## Numbers

Vestovoy is a Moscow courier that delivers for online shops and marketplaces. Its tracker asks
for the order code ("шифр заказа") the shop registered, so the input depends on the sender. The
corpus keeps one code that Vestovoy's own delivery text message quoted to a recipient: three
letters, a space and ten digits. One report does not show whether the letters belong to the
carrier or to the shop, so no rule claims the layout and the gap is declared. Marketplace order
numbers quoted in reviews stay out: the same report shows a shop order number that differs from
the code Vestovoy used.

## Retrieval lead

The tracking page embeds a form from the PostService platform at
`nextgen2.postsrvs.ru/lk2/5/tracking/cipher`, which opens a session; the form posts
`{"cypher": code}` to `/lk2/tracking/cipher/get`. The page reads summary rows and a history of
date and time, status and note; an unknown code answers `success: false`, shown as "Заказ не
найден". No found reply has been seen, so there is no adapter.

## Links

The tracking page embeds a form on the carrier's platform host that posts the code and draws
the history in place. No address opens one parcel.

## Testing

Provider live-test inputs and commands are in the
[provider READMEs](../../providers/README.md).
