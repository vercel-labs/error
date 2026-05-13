// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a Unicode tree frame with auto-detected formatting.
 *
 * @param header - The main error message line
 * @param sections - Detail lines (falsy values are filtered out)
 */
export function frame(
  header: string,
  sections?: (string | undefined | null | false)[],
): string {
  const { tree, color } = detectFormat();
  return renderFrame({ header, sections, tree, color });
}

/**
 * Format a string as a hint. Nil-safe — returns `undefined` if falsy.
 */
export function hint(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  return `hint: ${text}`;
}

/**
 * Format a string as a fix suggestion. Nil-safe — returns `undefined` if falsy.
 */
export function fix(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  return `fix: ${text}`;
}

/**
 * Format a URL as a link. Nil-safe — returns `undefined` if falsy.
 */
export function link(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  return `read more: ${url}`;
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
    if (typeof process === 'undefined') return { tree: false, color: false };
    if (process.env?.['NO_COLOR'] !== undefined)
      return { tree: true, color: false };
    if (process.env?.['FORCE_COLOR'] !== undefined)
      return { tree: true, color: true };
    if (process.stdout && 'isTTY' in process.stdout && process.stdout.isTTY) {
      return { tree: true, color: true };
    }
  } catch {
    return { tree: false, color: false };
  }

  if (typeof window !== 'undefined') return { tree: false, color: false };

  return { tree: false, color: false };
}

/**
 * Auto-format an error based on environment detection.
 * Used by `VercelError.toString()` for zero-config output.
 */
export function formatAuto(error: ErrorShape): string {
  const { tree, color } = detectFormat();
  const header = buildHeader(error, color);

  const sections = [
    error.reason,
    hint(error.hint),
    fix(error.fix),
    link(error.link),
  ];

  return renderFrame({ header, sections, tree, color });
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

const ANSI = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  bold: '\x1b[1m',
  resetBold: '\x1b[22m',
  dim: '\x1b[2m',
  underline: '\x1b[4m',
} as const;

const BOX = {
  pipe: '│',
  tee: '├──',
  teeArrow: '├─▸',
  corner: '╰──',
  cornerArrow: '╰─▸',
} as const;

const ACTIONABLE_PREFIXES = ['hint: ', 'fix: ', 'read more: '] as const;

/**
 * Build the error header line.
 *
 * With qualifier:  `error: VercelError [scope:code] message`
 * Without:         `error: VercelError: message`
 * ANSI:            `error:` red+bold, name red, `[qualifier]` red, message red+bold
 */
function buildHeader(error: ErrorShape, color: boolean): string {
  const qualifier = [error.scope, error.code].filter(Boolean).join(':');
  const plain = qualifier
    ? `error: ${error.name} [${qualifier}] ${error.message}`
    : `error: ${error.name}: ${error.message}`;

  if (!color) return plain;

  const label = `${ANSI.red}${ANSI.bold}error:${ANSI.resetBold}`;
  const name = `${ANSI.red}${error.name}`;
  const tag = qualifier ? ` [${qualifier}]` : ':';
  const message = `${ANSI.bold}${error.message}${ANSI.reset}`;

  return `${label} ${name}${tag} ${message}`;
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

function renderFrame({
  header,
  sections,
  tree,
  color,
}: RenderFrameOptions): string {
  const items = filterSections(sections);
  if (!items) return header;

  if (!tree) {
    return [header, ...items.map((item) => `  ${item}`)].join('\n');
  }

  const isLast = (i: number) => i === items.length - 1;
  const spacer = color ? `${ANSI.dim}${BOX.pipe}${ANSI.reset}` : BOX.pipe;
  const lines = [header, spacer];

  for (let i = 0; i < items.length; i++) {
    const actionable = isActionable(items[i]!);
    const connector = isLast(i)
      ? actionable
        ? BOX.cornerArrow
        : BOX.corner
      : actionable
        ? BOX.teeArrow
        : BOX.tee;
    const content = color ? colorizeLine(items[i]!) : items[i]!;
    const styledConnector = color
      ? `${ANSI.dim}${connector}${ANSI.reset}`
      : connector;
    lines.push(`${styledConnector} ${content}`);
  }

  return lines.join('\n');
}
