# Separate developer and public error details

## Context

Errors need rich technical details for diagnosis, but response recipients must not receive those details accidentally. A recognized `VercelError` and flat caller-authored response input have different disclosure defaults.

## Decision

Keep developer error details separate from a frozen snapshot of public error details. Treat every prose field in flat `ErrorResponseInput` as already approved for disclosure. When a `VercelError` has no public details, use a fixed generic message instead of developer text. Review error identity and HTTP status as separate disclosures.

## Reason

Explicit public details prevent developer text from becoming client-visible through serialization or body-format negotiation. A fixed fallback fails closed when no approved prose exists, while flat input remains concise for callers that already own the public response contract.

## Consequences

Authors provide separate public prose when clients need specific guidance. Reconstructed response prose remains public and must be reviewed before forwarding it to a different recipient.
