# Fixtures

Each file is the whole reply of `search-from-es` for one number. `delivered.json` is a bill in the
current layout, with warehouse arrivals and departures, the dispatch to the receiver and the
delivery, and its status code and expected date. `delivered-legacy.json` is an older bill whose
history uses the earlier operation wording. Both are public samples cited in
[`numbers.json`](../numbers.json); the service already masks most of the sender's and receiver's
details, and the adapter reads none of them. `not-found.json` is the reply for a number the
tracker does not know.
