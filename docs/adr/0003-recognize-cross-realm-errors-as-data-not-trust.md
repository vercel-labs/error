---
status: accepted
---

# Recognize cross-realm errors as data, not trust

`VercelError` values can cross package and realm seams where `instanceof` alone is insufficient. Recognition therefore uses `instanceof` for local instances and, as a cross-realm fallback, a namespaced but forgeable symbol plus data-shape validation; a successful `isVercelError` check permits reading the `VercelErrorLike` data contract but does not by itself authenticate the producer, authorize disclosure, or establish that local methods are safe. At the HTTP seam, current-tagged values are shape-validated before projection, and malformed current-tagged or shipped legacy-tagged values are rejected before the flat-public-input branch so developer text cannot be reinterpreted as disclosure-approved prose.
