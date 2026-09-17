# Security

This package's core guarantee is disclosure control: developer-facing error
details must never reach a client response unless explicitly approved under
`public`. Treat any violation of that guarantee as a security vulnerability,
not an ordinary bug.

Untagged response input must put approved prose under `public`; a plain
`message` is never public input. Terminal formatting removes control sequences,
not PII or confidential prose. Reporter integrations must scrub data before
transmission.

Report vulnerabilities privately through Vercel's bug bounty program for open
source projects: https://hackerone.com/vercel-open-source. Do not open a
public GitHub issue for a security report.
