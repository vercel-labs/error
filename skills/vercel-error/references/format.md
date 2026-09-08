# Terminal frames

Use this reference for deterministic terminal output or for readable output around a failure that should keep its existing type.

## Choose the presentation path

- Call `String(error)` or `error.toString()` for a `VercelError`; it uses the `auto` preset.
- Call `formatError(error, { format })` when the caller needs a specific preset.
- Use `frame`, `hint`, `fix`, and `link` for third-party errors and custom CLI output.
- Branch automation on the original error, stable code, or response object. Rendered text is not a protocol.

## Presets

| Preset  | Tree connectors | ANSI color | Ambient detection |
| ------- | --------------- | ---------- | ----------------- |
| `auto`  | Detected        | Detected   | Yes               |
| `plain` | No              | No         | No                |
| `tree`  | Yes             | No         | No                |
| `ansi`  | Yes             | Yes        | No                |

`auto` checks `NO_COLOR`, then `FORCE_COLOR`, then TTY support. Explicit presets ignore ambient state. Use `plain` for deterministic logs, `tree` for deterministic readable snapshots, and `ansi` only for a destination that supports terminal controls.

```ts
import { formatError } from '@vercel/error/format';

const logLine = formatError(error, { format: 'plain' });
```

## Custom frame

```ts
import { getMessage } from '@vercel/error';
import { frame, hint, link } from '@vercel/error/format';

function printSdkFailure(
  error: unknown,
  options: {
    docsUrl?: string;
    retrySuggestion?: string;
  },
): void {
  console.error(
    frame(
      'SDK request failed',
      [
        getMessage(error, 'The SDK returned an unknown error'),
        hint(options.retrySuggestion),
        link(options.docsUrl),
      ],
      { format: 'tree' },
    ),
  );
}
```

`hint`, `fix`, and `link` return structured `FrameSection` tokens or `undefined` for nil and empty text. Token kind controls labels, connectors, and color. A raw string that begins with `hint:` remains an ordinary detail; the renderer does not parse generated prefixes.

Use a concise header for what failed. Put explanation in raw detail sections and reserve `hint`, `fix`, and `link` for actionable content. Keep speculation out of `fix`.

## Containment

The renderer strips caller-provided ANSI, OSC, C1, DEL, and unsafe C0 controls. It normalizes CRLF to LF, removes bare carriage returns, preserves tabs and blank lines, and places every physical continuation line under library-owned indentation or a tree connector.

Apply the same framing behavior to headers, identity, messages, reasons, hints, fixes, links, and raw sections. Do not pre-flatten useful multiline text to work around log-forging risk; choose the required preset and let the renderer contain each line.

## For agents and automation

A frame helps a reader scan the fields:

```text
header -> what failed
detail -> why or relevant context
hint   -> what may help
fix    -> known remediation
link   -> deeper documentation
```

Automation should branch on a structured error code or response object, not labels, connector glyphs, line positions, or color sequences.
