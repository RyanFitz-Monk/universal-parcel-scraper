# Dachser fixtures

- `in-transit.json` — synthetic in-transit shipment with four Spanish events, the recipient's
  name and address the parser reads, and the sender, contact, signature and internal-note
  fields it must drop.
- `null-result-500.json` — scrubbed JSON 500 for an unknown shipment/access tuple (not-found).
- `null-message-500.json` — the same 500 with `message: null`, which stays an upstream error.
