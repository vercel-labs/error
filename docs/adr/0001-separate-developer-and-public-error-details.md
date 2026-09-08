---
status: accepted
---

# Separate developer and public error details

Errors need rich technical details for diagnosis, but response recipients must not receive those details accidentally. `VercelError` therefore keeps developer error details separate from a frozen snapshot of public error details, while flat `ErrorResponseInput` exists only for callers whose prose is already approved for disclosure; when a `VercelError` has no public details, response data uses a fixed generic message instead of developer text. Error identity and HTTP status remain separate disclosures that the application must review.
