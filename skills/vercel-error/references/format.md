# Terminal frames

Use this reference for readable terminal output when the underlying failure should remain its existing type.

## Choose the presentation path

- Call `String(error)` or `error.toString()` for a `VercelError`; it already renders its structured fields.
- Use `frame`, `hint`, `fix`, and `link` from `@vercel/error/format` for third-party errors and custom CLI output.
- Automation should use the original error, a stable code, or another structured object. Do not parse rendered output.

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

| Environment                                      | Output                  |
| ------------------------------------------------ | ----------------------- |
| `NO_COLOR`                                       | Tree without ANSI color |
| `FORCE_COLOR` or a TTY, unless `NO_COLOR` is set | Tree with ANSI color    |
| Browser, pipe, CI, or non-Node runtime           | Plain text              |

Caller-provided control sequences are stripped. Tabs and line breaks are preserved, so normalize `\r` and `\n` before writing to a sink that requires one physical line per event. Verify these behaviors in the installed package version before relying on them.

Do not build raw ANSI sequences. Use the package helpers, which handle colors, tree connectors, missing values, and environment detection.

## For agents and automation

A frame helps a person or coding agent scan an error consistently:

```text
header -> what failed
detail -> why or relevant context
hint   -> what may help
fix    -> known remediation
link   -> deeper documentation
```

It remains text. Downstream automation should branch on a structured error code or response object, not on `hint:`, `fix:`, connector glyphs, line positions, or color sequences.
