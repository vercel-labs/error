// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a Unicode tree frame with auto-detected formatting.
 *
 * Terminal control sequences in `header` and `sections` are stripped
 * (see {@link sanitize}).
 *
 * @param header - The main error message line
 * @param sections - Detail lines (falsy values are filtered out)
 */
export function frame(
  header: string,
  sections?: (string | undefined | null | false)[],
): string {
  const { tree, color } = detectFormat();
  return renderFrame({
    color,
    header: sanitize(header),
    sections: sections?.map((s) => (typeof s === 'string' ? sanitize(s) : s)),
    tree,
  });
}

/**
 * Format a string as a hint. Nil-safe. Returns `undefined` if falsy.
 *
 * Terminal control sequences in `text` are stripped (see {@link sanitize}).
 */
export function hint(text: string | undefined | null): string | undefined {
  if (!text) {
    return undefined;
  }
  return `hint: ${sanitize(text)}`;
}

/**
 * Format a string as a fix suggestion. Nil-safe. Returns `undefined` if falsy.
 *
 * Terminal control sequences in `text` are stripped (see {@link sanitize}).
 */
export function fix(text: string | undefined | null): string | undefined {
  if (!text) {
    return undefined;
  }
  return `fix: ${sanitize(text)}`;
}

/**
 * Format a URL as a link. Nil-safe. Returns `undefined` if falsy.
 *
 * Terminal control sequences in `url` are stripped (see {@link sanitize}).
 */
export function link(url: string | undefined | null): string | undefined {
  if (!url) {
    return undefined;
  }
  return `read more: ${sanitize(url)}`;
}

// ---------------------------------------------------------------------------
// Internal API (used by VercelError.toString)
// ---------------------------------------------------------------------------

/**
 * Detect formatting capabilities of the current environment.
 *
 * - `tree`: use Unicode box-drawing characters (├──, ╰──)
 * - `color`: use ANSI escape codes (red, green, bold, underline)
 *
 * Detection:
 * 1. Non-Node (no `process`) → plain (no tree, no color)
 * 2. `NO_COLOR` env var → tree only, no color
 * 3. `FORCE_COLOR` env var → tree + color
 * 4. TTY → tree + color
 * 5. Browser → plain
 * 6. Fallback (piped, CI) → plain
 */
export function detectFormat(): { tree: boolean; color: boolean } {
  try {
    if (typeof process === 'undefined') {
      return { color: false, tree: false };
    }
    if (process.env?.['NO_COLOR'] !== undefined) {
      return { color: false, tree: true };
    }
    if (process.env?.['FORCE_COLOR'] !== undefined) {
      return { color: true, tree: true };
    }
    if (process.stdout && 'isTTY' in process.stdout && process.stdout.isTTY) {
      return { color: true, tree: true };
    }
  } catch {
    return { color: false, tree: false };
  }

  if (typeof window !== 'undefined') {
    return { color: false, tree: false };
  }

  return { color: false, tree: false };
}

/**
 * Auto-format an error based on environment detection.
 * Used by `VercelError.toString()` for zero-config output.
 */
export function formatAuto(error: ErrorShape): string {
  const { tree, color } = detectFormat();
  const header = buildHeader(error, color);

  const reason =
    error.reason !== undefined ? sanitize(error.reason) : undefined;

  const sections = [reason, hint(error.hint), fix(error.fix), link(error.link)];

  return renderFrame({ color, header, sections, tree });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ErrorShape {
  name: string;
  message: string;
  code?: string;
  scope?: string;
  reason?: string;
  hint?: string;
  fix?: string;
  link?: string;
}

/**
 * Matches complete ANSI escape sequences introduced by `ESC` (0x1b): CSI
 * (`ESC [ … final`), OSC (`ESC ] … BEL/ST`, e.g. OSC 8 hyperlinks and OSC 52
 * clipboard), and other two/three-byte escapes. Removing the whole sequence,
 * rather than only the `ESC` byte, keeps the visible text clean.
 */
/* oxlint-disable no-control-regex -- intentional terminal control-char matching */
const ANSI_ESCAPE =
  /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][\s\S]*?(?:\x07|\x1b\\)|[@-Z\\-_])/g;

/**
 * Matches standalone terminal control characters left after ANSI sequences are
 * removed: C0 controls (except `\t`, `\n`, `\r`), the C1 range, and `DEL`.
 */
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g;
/* oxlint-enable no-control-regex */

/**
 * Strip terminal control sequences from caller-controlled text before it is
 * rendered to a terminal. Error fields can originate from an untrusted upstream
 * (e.g. an HTTP error body parsed by `parseErrorResponse`); without this a
 * malicious upstream could inject escape sequences that rewrite the screen,
 * forge log lines, or abuse terminal features (OSC 8 links, OSC 52 clipboard).
 * Full ANSI sequences are removed first, then any leftover control bytes.
 * Preserves `\t`, `\n`, `\r`.
 */
function sanitize(text: string): string {
  return text.replace(ANSI_ESCAPE, '').replace(CONTROL_CHARS, '');
}

const ANSI = {
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
  resetBold: '\x1b[22m',
  underline: '\x1b[4m',
  yellow: '\x1b[33m',
} as const;

const BOX = {
  corner: '╰──',
  cornerArrow: '╰─▸',
  pipe: '│',
  tee: '├──',
  teeArrow: '├─▸',
} as const;

const ACTIONABLE_PREFIXES = ['hint: ', 'fix: ', 'read more: '] as const;

/**
 * Build the error header line.
 *
 * With qualifier:    `error: VercelError [scope:code] message`
 * Without:           `error: VercelError: message`
 * Stripped message:  `error: VercelError [scope:code]` (qualifier only)
 * No message at all:  `error: VercelError`
 * ANSI:              `error:` red+bold, name red, `[qualifier]` red, message red+bold
 *
 * When `message` is empty, such as after production stripping, the qualifier
 * stands in for it so the error still identifies itself by `scope` and `code`.
 */
function buildHeader(error: ErrorShape, color: boolean): string {
  const parts: HeaderParts = {
    name: sanitize(error.name),
    message: sanitize(error.message),
    qualifier: [error.scope, error.code]
      .filter((part): part is string => Boolean(part))
      .map(sanitize)
      .join(':'),
  };

  return color ? buildColorHeader(parts) : buildPlainHeader(parts);
}

interface HeaderParts {
  name: string;
  qualifier: string;
  message: string;
}

function buildPlainHeader({ name, qualifier, message }: HeaderParts): string {
  if (qualifier) {
    return message
      ? `error: ${name} [${qualifier}] ${message}`
      : `error: ${name} [${qualifier}]`;
  }
  return message ? `error: ${name}: ${message}` : `error: ${name}`;
}

function buildColorHeader({ name, qualifier, message }: HeaderParts): string {
  const label = `${ANSI.red}${ANSI.bold}error:${ANSI.resetBold}`;

  if (qualifier) {
    const head = `${label} ${ANSI.red}${name} [${qualifier}]`;
    return message
      ? `${head} ${ANSI.bold}${message}${ANSI.reset}`
      : `${head}${ANSI.reset}`;
  }

  return message
    ? `${label} ${ANSI.red}${name}: ${ANSI.bold}${message}${ANSI.reset}`
    : `${label} ${ANSI.red}${name}${ANSI.reset}`;
}

function filterSections(
  sections: (string | undefined | null | false)[] | undefined,
): string[] | undefined {
  const items = sections?.filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  );
  return items && items.length > 0 ? items : undefined;
}

function colorizeLine(line: string): string {
  if (line.startsWith('hint: ')) {
    return `${ANSI.yellow}${ANSI.bold}hint:${ANSI.reset} ${line.slice(6)}`;
  }
  if (line.startsWith('fix: ')) {
    return `${ANSI.green}${ANSI.bold}fix:${ANSI.reset} ${line.slice(5)}`;
  }
  if (line.startsWith('read more: ')) {
    return `${ANSI.bold}read more:${ANSI.reset} ${ANSI.underline}${line.slice(11)}${ANSI.reset}`;
  }
  return line;
}

interface RenderFrameOptions {
  header: string;
  sections?: (string | undefined | null | false)[];
  tree: boolean;
  color: boolean;
}

function isActionable(line: string): boolean {
  return ACTIONABLE_PREFIXES.some((prefix) => line.startsWith(prefix));
}

/**
 * Render the final framed output. Inputs must already be {@link sanitize}d:
 * this stage applies the library's own ANSI styling (`colorizeLine`,
 * connectors), so it cannot strip control characters without destroying that
 * styling. Callers (`frame`, `formatAuto`) own sanitization of untrusted text.
 */
function renderFrame({
  header,
  sections,
  tree,
  color,
}: RenderFrameOptions): string {
  const items = filterSections(sections);
  if (!items) {
    return header;
  }

  if (!tree) {
    return [header, ...items.map((item) => `  ${item}`)].join('\n');
  }

  const isLast = (i: number) => i === items.length - 1;
  const spacer = color ? `${ANSI.dim}${BOX.pipe}${ANSI.reset}` : BOX.pipe;
  const lines = [header, spacer];

  for (const [i, item] of items.entries()) {
    const actionable = isActionable(item);
    const connector = isLast(i)
      ? actionable
        ? BOX.cornerArrow
        : BOX.corner
      : actionable
        ? BOX.teeArrow
        : BOX.tee;
    const content = color ? colorizeLine(item) : item;
    const styledConnector = color
      ? `${ANSI.dim}${connector}${ANSI.reset}`
      : connector;
    lines.push(`${styledConnector} ${content}`);
  }

  return lines.join('\n');
}
