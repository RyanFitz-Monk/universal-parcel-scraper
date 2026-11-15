# Ship24 fixtures

- `delivered.json`: a synthetic `/api/parcels/{number}` reply for a delivered shipment,
  with two reported couriers, one leg without an offset, a scan location, a delivery naming its
  PIN, signatory and door, which the parser keeps, and recipient and courier contact values it
  must drop. Identifiers are made up.
