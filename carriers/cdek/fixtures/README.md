# Fixtures

`pickup.json` and `courier.json` follow the shape of the tracking service's reply for an order:
the order's number, its milestones oldest first with the scans in each grouped by city, a
milestone it has not reached yet marked as future, the current status and the page's widget,
the recipient's initials, address and pickup code, which the adapter reads, and the sender's
address, offices, phones and coordinates, which it does not. Numbers, names, places, clocks and codes are invented. `not-found.json` is
the reply for a number the service does not know.
