# Hound Express

Hound Express is a Mexican courier for e-commerce and cross-border parcels, including imports
it clears through Mexican customs before delivery.

## Numbers

Hound Express's FAQ describes guide numbers of sixteen digits or of twenty-two characters,
digits with at times one letter among them. Its partner API documentation shows sixteen-digit
guides and one guide of `HP` followed by sixteen digits. Sixteen digits are a run other
carriers share and the `HP` layout has a single example, so no rule claims either; the adapter
answers an explicit selection.

## Retrieval

The tracking page's script posts a JSON list of `{"guideNumber": …}` to
`ws_pods.hound-express.com/Sabueso/ws/deliveryServices/trackOrder` with the partner key it
embeds for every visitor in a `partnerKey` header. The adapter sends the same request for one
guide and requires the reply to name it. An unknown guide answers HTTP 200 with no scans and a
`GONULL` warning, or with `flag` 100, which the page reports as not operated in its system;
both are not found. Errors the service lists for the guide are failures, and an HTTP 404
means the service moved, not that the guide is missing.

The reply lists the scans oldest first. Each has a `statusObj` with a numeric id and Spanish
and English wordings, which the adapter shows in the reader's language. A `dateTimeISO` keeps
the offset it states; a bare `dateTime` is read on UTC−06:00, as the API documentation gives
it and central Mexico keeps all year. The receiver's name, the client reference, the notes and
the coordinates are left out.

## Stages

The page's script groups status ids into five steps: documented, collected or crossing the
border, at the destination branch or received in Mexico, on the delivery route, and delivered.
The adapter stages the ids of each step, with the delivery route as in transit because the
script does not tell its ids apart. Every step also has ids the script shows as a problem
without naming it; they keep their wording without a stage, except the documented attempt
where nobody received the parcel and the FAQ's held-at-customs and prohibited-import wordings.

No found reply has been seen: the parser follows the page's script and the API documentation,
and its fixture is synthetic.

## Testing

`HOUND_EXPRESS_TRACKING_NUMBER=… HOUND_EXPRESS_UNKNOWN_NUMBER=… npm run test:carriers:live -- carriers/hound-express`
