# Terminal frames

Use this reference for readable terminal output when the underlying failure should remain its existing type.

## Choose the presentation path

- Call `String(error)` or `error.toString()` for a `VercelError`; it already renders its structured fields.
- Use `frame`, `hint`, `fix`, and `link` from `@vercel/error/format` for third-party errors and custom CLI output.
- Keep machine handling on the original error, a stable code, or another structured object. Do not parse rendered output.

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
    frame('SDK request failed', [
      getMessage(error, 'The SDK returned an unknown error'),
      hint(options.retrySuggestion),
      link(options.docsUrl),
    ]),
  );
}
```

The formatting helpers return `undefined` for missing or empty text, and `frame()` filters absent sections. Keep optional values optional instead of printing placeholders such as `hint: undefined`.

Use a stable, concise header for what failed. Put explanation in ordinary sections and reserve `hint`, `fix`, and `link` for actionable content. Do not label speculation as a fix.

## Rendering behavior

Formatting is automatic:

1. Outside Node, output is plain.
2. `NO_COLOR` produces a Unicode tree without ANSI color.
3. `FORCE_COLOR` produces a colored tree.
4. A TTY produces a colored tree.
5. Browser, piped, and CI output is plain.

The package strips ANSI, OSC, C0, C1, and DEL control sequences from caller-provided text before rendering. It preserves tabs, newlines, and carriage returns. If a logging sink requires one physical line per event, normalize line breaks for that sink separately.

Do not build raw ANSI sequences. The package owns coloring, connectors, nil handling, and environment detection.

## Agent boundary

A frame helps a person or coding agent scan an error consistently:

```text
header -> what failed
detail -> why or relevant context
hint   -> what may help
fix    -> known remediation
link   -> deeper documentation
```

It remains text. Downstream automation should branch on a structured error code or response object, not on `hint:`, `fix:`, connector glyphs, line positions, or color sequences.
