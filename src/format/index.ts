import type { VercelErrorLike } from '../types';

/**
 * Rendering preset for error frames. `auto` reads `NO_COLOR`, `FORCE_COLOR`,
 * and TTY state. `plain` uses indentation only, `tree` adds Unicode connectors,
 * and `ansi` adds connectors and ANSI styling without reading ambient state.
 */
export type ErrorFormat = 'auto' | 'plain' | 'tree' | 'ansi';

/**
 * Content accepted by {@link frame}. Strings are unlabeled details. Structured
 * variants select library-owned labels, connectors, and styles; their text is
 * sanitized during rendering. Raw string prefixes carry no special meaning.
 * Use {@link hint}, {@link fix}, and {@link link} to create structured sections.
 */
export type FrameSection =
  | string
  | { readonly kind: 'hint'; readonly text: string }
  | { readonly kind: 'fix'; readonly text: string }
  | { readonly kind: 'link'; readonly text: string };

/**
 * Render an error with deterministic or environment-detected formatting.
 *
 * `auto` detects tree and color support. `plain` uses indentation only, `tree`
 * uses Unicode connectors without color, and `ansi` uses connectors and ANSI
 * styling without consulting ambient terminal state. Every caller-controlled
 * physical line is sanitized and placed under a library-owned prefix. Omitting
 * `format` selects `auto`, the only preset that reads ambient terminal state.
 */
export function formatError(
  error: VercelErrorLike,
  options: {
    /** Rendering preset; omission selects `auto`. */
    readonly format?: ErrorFormat;
  } = {},
): string {
  const capabilities = resolveFormat(options.format ?? 'auto');
  const qualifier = [error.scope, error.code].filter(Boolean).join(':');
  const name = error.name ?? 'VercelError';
  const header = qualifier
    ? error.message
      ? `error: ${name} [${qualifier}] ${error.message}`
      : `error: ${name} [${qualifier}]`
    : error.message
      ? `error: ${name}: ${error.message}`
      : `error: ${name}`;

  return renderFrame({
    ...capabilities,
    header,
    sections: [
      error.reason,
      hint(error.hint),
      fix(error.fix),
      link(error.link),
    ],
    styleHeader: true,
  });
}

/**
 * Compose a sanitized frame from a header and raw or structured sections.
 *
 * Structured sections control labels, connectors, and ANSI styling without a
 * string-prefix protocol. Falsy sections are omitted. `format` has the same
 * preset meanings as {@link formatError} and defaults to `auto`. A malformed
 * structured section supplied at runtime throws `TypeError`.
 */
export function frame(
  header: string,
  sections?: readonly (FrameSection | null | undefined | false)[],
  options: {
    /** Rendering preset; omission selects `auto`. */
    readonly format?: ErrorFormat;
  } = {},
): string {
  return renderFrame({
    ...resolveFormat(options.format ?? 'auto'),
    header,
    sections,
    styleHeader: false,
  });
}

/** Return a structured hint section, or `undefined` for nil or empty text. */
export function hint(
  text: string | null | undefined,
): { readonly kind: 'hint'; readonly text: string } | undefined {
  return text ? { kind: 'hint', text } : undefined;
}

/** Return a structured fix section, or `undefined` for nil or empty text. */
export function fix(
  text: string | null | undefined,
): { readonly kind: 'fix'; readonly text: string } | undefined {
  return text ? { kind: 'fix', text } : undefined;
}

/** Return a structured link section, or `undefined` for nil or empty text. */
export function link(
  text: string | null | undefined,
): { readonly kind: 'link'; readonly text: string } | undefined {
  return text ? { kind: 'link', text } : undefined;
}

/** @internal Detect capabilities used by the `auto` preset. */
function detectFormat(): { tree: boolean; color: boolean } {
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
    if (process.stdout?.isTTY) {
      return { color: true, tree: true };
    }
  } catch {
    return { color: false, tree: false };
  }

  return { color: false, tree: false };
}

interface FormatCapabilities {
  readonly tree: boolean;
  readonly color: boolean;
}

function resolveFormat(format: ErrorFormat): FormatCapabilities {
  switch (format) {
    case 'plain':
      return { color: false, tree: false };
    case 'tree':
      return { color: false, tree: true };
    case 'ansi':
      return { color: true, tree: true };
    default:
      return detectFormat();
  }
}

/* oxlint-disable no-control-regex -- intentional terminal control-char matching */
const ANSI_ESCAPE =
  /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)?|[@-Z\\-_])/g;
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u2028\u2029]/g;
/* oxlint-enable no-control-regex */

/**
 * Remove terminal controls and Unicode line separators, normalize CRLF, and
 * remove bare carriage returns. Tabs and line feeds remain useful and are
 * contained during physical framing.
 */
function sanitize(text: string): string {
  return text
    .replace(ANSI_ESCAPE, '')
    .replace(CONTROL_CHARS, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '');
}

const ANSI = {
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
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

type SectionKind = 'detail' | 'hint' | 'fix' | 'link';

interface PreparedSection {
  readonly kind: SectionKind;
  readonly lines: readonly string[];
}

interface RenderFrameOptions extends FormatCapabilities {
  readonly header: string;
  readonly sections?: readonly (FrameSection | null | undefined | false)[];
  readonly styleHeader: boolean;
}

function renderFrame({
  color,
  header,
  sections,
  styleHeader,
  tree,
}: RenderFrameOptions): string {
  const headerLines = sanitize(header).split('\n');
  const prepared = prepareSections(sections);
  const lines: string[] = [];

  const firstHeaderLine = headerLines[0] ?? '';
  lines.push(
    color && styleHeader ? colorizeHeader(firstHeaderLine) : firstHeaderLine,
  );

  for (const continuation of headerLines.slice(1)) {
    if (tree) {
      lines.push(
        `${styleConnector(BOX.pipe, color)} ${
          color && styleHeader ? colorizeHeader(continuation) : continuation
        }`,
      );
    } else {
      lines.push(`  ${continuation}`);
    }
  }

  if (prepared.length === 0) {
    return lines.join('\n');
  }

  if (!tree) {
    for (const section of prepared) {
      for (const [index, line] of section.lines.entries()) {
        lines.push(`  ${renderSectionLine(line, section.kind, index, false)}`);
      }
    }
    return lines.join('\n');
  }

  lines.push(styleConnector(BOX.pipe, color));

  for (const [sectionIndex, section] of prepared.entries()) {
    const isLast = sectionIndex === prepared.length - 1;
    const actionable = section.kind !== 'detail';
    const connector = isLast
      ? actionable
        ? BOX.cornerArrow
        : BOX.corner
      : actionable
        ? BOX.teeArrow
        : BOX.tee;

    const [first = '', ...continuations] = section.lines;
    lines.push(
      `${styleConnector(connector, color)} ${renderSectionLine(
        first,
        section.kind,
        0,
        color,
      )}`,
    );

    for (const [index, continuation] of continuations.entries()) {
      lines.push(
        `${styleConnector(BOX.pipe, color)}   ${renderSectionLine(
          continuation,
          section.kind,
          index + 1,
          color,
        )}`,
      );
    }
  }

  return lines.join('\n');
}

function prepareSections(
  sections: RenderFrameOptions['sections'],
): PreparedSection[] {
  const prepared: PreparedSection[] = [];

  for (const section of sections ?? []) {
    if (!section) continue;

    if (typeof section === 'string') {
      const text = sanitize(section);
      if (text.length > 0) {
        prepared.push({ kind: 'detail', lines: text.split('\n') });
      }
      continue;
    }

    if (!isStructuredSection(section)) {
      throw new TypeError(
        "Frame sections must be strings or { kind: 'hint' | 'fix' | 'link', text: string } objects",
      );
    }

    const text = sanitize(section.text);
    if (text.length === 0) continue;

    prepared.push({ kind: section.kind, lines: text.split('\n') });
  }

  return prepared;
}

function styleConnector(connector: string, color: boolean): string {
  return color ? `${ANSI.dim}${connector}${ANSI.reset}` : connector;
}

function colorizeHeader(line: string): string {
  return `${ANSI.red}${ANSI.bold}${line}${ANSI.reset}`;
}

function isStructuredSection(
  section: unknown,
): section is Exclude<FrameSection, string> {
  if (typeof section !== 'object' || section === null) return false;

  const candidate = section as {
    readonly kind?: unknown;
    readonly text?: unknown;
  };
  return (
    (candidate.kind === 'hint' ||
      candidate.kind === 'fix' ||
      candidate.kind === 'link') &&
    typeof candidate.text === 'string'
  );
}

function renderSectionLine(
  line: string,
  kind: SectionKind,
  lineIndex: number,
  color: boolean,
): string {
  if (kind === 'detail') return line;

  if (lineIndex > 0) {
    return color && kind === 'link'
      ? `${ANSI.underline}${line}${ANSI.reset}`
      : line;
  }

  const label = kind === 'link' ? 'read more:' : `${kind}:`;
  if (!color) return `${label} ${line}`;

  const labelColor = kind === 'hint' ? ANSI.yellow : ANSI.green;

  if (kind === 'link') {
    return `${ANSI.bold}${label}${ANSI.reset} ${ANSI.underline}${line}${ANSI.reset}`;
  }

  return `${labelColor}${ANSI.bold}${label}${ANSI.reset} ${line}`;
}
