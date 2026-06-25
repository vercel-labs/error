import MagicString from 'magic-string';
import { parseSync } from 'oxc-parser';

/**
 * Module specifier the `VercelError` class and `createErrors` factory must be
 * imported from for a call site to be eligible for stripping.
 */
const PACKAGE_NAME = '@vercel/error';

/**
 * Prose option properties removed from production builds. These hold
 * human-readable text that bloats client bundles. Structured fields
 * (`code`, `scope`, `statusCode`, `link`) are preserved.
 */
const PROSE_PROPS = new Set(['reason', 'hint', 'fix', 'userMessage']);

/**
 * Factory methods exposed by `createErrors`. Calls to these on a tracked
 * factory binding are stripped like a direct `new VercelError(...)`.
 */
const FACTORY_METHODS = new Set(['create', 'raise', 'report']);

/**
 * Result of {@link transform}: the rewritten code, a source map, and the
 * number of call sites that were stripped. `null` when nothing changed.
 */
export interface TransformResult {
  code: string;
  map: ReturnType<MagicString['generateMap']>;
  /** Count of `new VercelError`/factory call sites rewritten in this module. */
  count: number;
}

/**
 * Strip human-readable prose from `@vercel/error` call sites for production
 * builds. Removes the `message` argument and the `reason`, `hint`, `fix`, and
 * `userMessage` options from `new VercelError(...)` and from `createErrors`
 * factory calls (`.create`/`.raise`/`.report`). Preserves `code`, `scope`,
 * `statusCode`, and `link` so a stripped error still identifies itself.
 *
 * Only call sites bound to imports from `@vercel/error` are touched. Dynamic
 * option objects (spreads, variables) are left intact. Returns `null` when the
 * source has no eligible call sites or no changes were made.
 */
export function transform(code: string, id: string): TransformResult | null {
  // Cheap bailout: skip files that never reference the package.
  if (!code.includes(PACKAGE_NAME)) return null;

  const { program, errors } = parseSync(id, code);
  if (errors.length > 0) return null;

  const bindings = collectBindings(program);
  if (!bindings.errorClasses.size && !bindings.factories.size) return null;

  const magic = new MagicString(code);
  let count = 0;

  walk(program, (node) => {
    if (
      isStrippableNew(node, bindings.errorClasses) ||
      isStrippableFactoryCall(node, bindings.factories)
    ) {
      if (stripCall(magic, code, node)) count++;
    }
  });

  if (count === 0) return null;

  return {
    code: magic.toString(),
    map: magic.generateMap({ source: id, hires: true }),
    count,
  };
}

interface Bindings {
  /** Local names bound to the `VercelError` import. */
  errorClasses: Set<string>;
  /** Local names of variables assigned from `createErrors(...)`. */
  factories: Set<string>;
}

/**
 * Collect local identifiers bound to `VercelError` and to `createErrors`
 * results. Handles named and aliased imports from `@vercel/error`. Namespace
 * imports are intentionally ignored, since member access cannot be resolved
 * statically with confidence.
 */
function collectBindings(program: AnyNode): Bindings {
  const errorClasses = new Set<string>();
  const factories = new Set<string>();
  const createErrorsNames = new Set<string>();

  for (const node of program.body ?? []) {
    if (
      node.type !== 'ImportDeclaration' ||
      node.source?.value !== PACKAGE_NAME
    ) {
      continue;
    }
    for (const spec of node.specifiers ?? []) {
      if (spec.type !== 'ImportSpecifier') continue;
      const imported = spec.imported?.name;
      const local = spec.local?.name;
      if (!imported || !local) continue;
      if (imported === 'VercelError') errorClasses.add(local);
      if (imported === 'createErrors') createErrorsNames.add(local);
    }
  }

  if (createErrorsNames.size > 0) {
    walk(program, (node) => {
      if (node.type !== 'VariableDeclarator') return;
      const init = node.init;
      if (
        init?.type === 'CallExpression' &&
        init.callee?.type === 'Identifier' &&
        createErrorsNames.has(init.callee.name) &&
        node.id?.type === 'Identifier'
      ) {
        factories.add(node.id.name);
      }
    });
  }

  return { errorClasses, factories };
}

/** `new VercelError(...)` where the callee is a tracked error class binding. */
function isStrippableNew(node: AnyNode, errorClasses: Set<string>): boolean {
  return (
    node.type === 'NewExpression' &&
    node.callee?.type === 'Identifier' &&
    errorClasses.has(node.callee.name)
  );
}

/** `factory.create|raise|report(...)` where `factory` is a tracked binding. */
function isStrippableFactoryCall(
  node: AnyNode,
  factories: Set<string>,
): boolean {
  if (node.type !== 'CallExpression') return false;
  const callee = node.callee;
  return (
    callee?.type === 'MemberExpression' &&
    callee.object?.type === 'Identifier' &&
    factories.has(callee.object.name) &&
    callee.property?.type === 'Identifier' &&
    FACTORY_METHODS.has(callee.property.name)
  );
}

/**
 * Blank the message argument and remove prose properties from the options
 * object of a call. The call is assumed to follow the `(message, options)`
 * shape shared by `new VercelError()` and the `createErrors` factory methods.
 * Returns whether any edit was made.
 */
function stripCall(magic: MagicString, code: string, node: AnyNode): boolean {
  const args = node.arguments ?? [];
  if (args.length === 0) return false;

  let changed = false;

  const message = args[0];
  if (isStringLiteralLike(message)) {
    magic.overwrite(message.start, message.end, "''");
    changed = true;
  }

  const options = args[1];
  if (options?.type === 'ObjectExpression') {
    changed = stripProseProps(magic, code, options) || changed;
  }

  return changed;
}

/**
 * Remove prose properties from an options object literal. Skips objects that
 * contain spreads, since their final shape is not statically known. Each
 * removed property also consumes its trailing comma (or the preceding comma
 * when it is the last property) so the object stays valid.
 */
function stripProseProps(
  magic: MagicString,
  code: string,
  object: AnyNode,
): boolean {
  const props = (object.properties ?? []) as AnyNode[];
  if (props.some((p) => p.type === 'SpreadElement')) return false;

  let changed = false;
  for (const prop of props) {
    if (
      prop.type !== 'Property' ||
      prop.key?.type !== 'Identifier' ||
      !PROSE_PROPS.has(prop.key.name)
    ) {
      continue;
    }

    const trailingComma = nextCommaIndex(code, prop.end, object.end);
    if (trailingComma !== -1) {
      // Remove the property and its trailing comma.
      magic.remove(prop.start, trailingComma + 1);
    } else {
      // Last property: remove it and any preceding comma.
      magic.remove(prevCommaIndex(code, prop.start, object.start), prop.end);
    }
    changed = true;
  }
  return changed;
}

/**
 * Index of the first comma between `from` and `limit`, skipping whitespace.
 * Returns -1 when the next non-whitespace character is not a comma (the
 * property is the last in the object).
 */
function nextCommaIndex(code: string, from: number, limit: number): number {
  for (let i = from; i < limit; i++) {
    const ch = code[i];
    if (ch === ',') return i;
    if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') return -1;
  }
  return -1;
}

/**
 * Index of the comma immediately before `from`, scanning back over whitespace.
 * Falls back to `from` when none is found (the property is the only one).
 */
function prevCommaIndex(code: string, from: number, limit: number): number {
  for (let i = from - 1; i >= limit; i--) {
    const ch = code[i];
    if (ch === ',') return i;
    if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') break;
  }
  return from;
}

function isStringLiteralLike(node: AnyNode | undefined): boolean {
  if (!node) return false;
  if (node.type === 'Literal') return typeof node.value === 'string';
  // Template literal with no expressions is a static string.
  return (
    node.type === 'TemplateLiteral' && (node.expressions ?? []).length === 0
  );
}

// ---------------------------------------------------------------------------
// Minimal AST walk
// ---------------------------------------------------------------------------

/**
 * Loosely typed AST node. The oxc AST is ESTree-compatible; this transform
 * only reads a small, well-known subset of fields. Properties are typed as
 * `any` because the walk traverses arbitrary node shapes.
 */
interface AnyNode {
  type: string;
  start: number;
  end: number;
  // eslint-disable-next-line ts/no-explicit-any -- AST traversal reads arbitrary node fields
  [key: string]: any;
}

/**
 * Depth-first walk over every node in the tree, invoking `visit` on each.
 */
function walk(node: AnyNode, visit: (node: AnyNode) => void): void {
  visit(node);
  for (const key in node) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isNode(child)) walk(child, visit);
      }
    } else if (isNode(value)) {
      walk(value, visit);
    }
  }
}

function isNode(value: unknown): value is AnyNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}
