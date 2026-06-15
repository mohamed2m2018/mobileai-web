// jsx-codemod.mjs
//
// Babel codemod: converts compiled JSX (the `_jsx`/`_jsxs`/`jsx`/`jsxs`/`_jsxDEV`
// CallExpression form emitted by the automatic runtime) back into real, readable
// JSX. Used to re-author the web SDK UI source as `.jsx` while still shipping the
// exact same compiled ESM.
//
// Strategy:
//   - POST-ORDER traversal (`CallExpression: { exit }`) so inner elements convert
//     before their parents — by the time we look at a parent's `children`, the
//     child call expressions have already been replaced with JSXElement nodes.
//   - Bail-safe: any call we can't confidently convert is left exactly as-is, and
//     in that case we also keep the `react/jsx-runtime` import so the output still
//     runs. The round-trip verifier (build-web-jsx + diff) is the correctness gate.
//
// Usage:
//   node scripts/jsx-codemod.mjs            # convert the 4 known web UI files
//   node scripts/jsx-codemod.mjs <file...>  # convert specific .js files -> .jsx

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const r = createRequire('/Users/mohamedsalah/mobileai-suite-copy/react-native-ai-agent/index.js');
const parser = r('@babel/parser');
const traverse = r('@babel/traverse').default;
const generate = r('@babel/generator').default;
const t = r('@babel/types');
const prettier = r('prettier');

// The runtime helper callee names we know how to convert.
const JSX_CALLEES = new Set(['_jsx', '_jsxs', '_jsxDEV', 'jsx', 'jsxs', 'jsxDEV']);
// The Fragment identifier names (local binding from the jsx-runtime import).
const FRAGMENT_NAMES = new Set(['_Fragment', 'Fragment']);

/**
 * Is this a JSX runtime call we should attempt to convert?
 * Matches CallExpression whose callee is one of the known identifiers.
 */
function isJsxCall(node) {
  return (
    t.isCallExpression(node) &&
    t.isIdentifier(node.callee) &&
    JSX_CALLEES.has(node.callee.name)
  );
}

/** Build the JSX element/component "name" node from the type argument. */
function buildJsxName(typeArg) {
  // String literal => intrinsic lowercase tag, e.g. "div" -> <div>
  if (t.isStringLiteral(typeArg)) {
    return { kind: 'element', name: t.jsxIdentifier(typeArg.value) };
  }
  // Plain identifier => component or Fragment.
  if (t.isIdentifier(typeArg)) {
    if (FRAGMENT_NAMES.has(typeArg.name)) {
      return { kind: 'fragment' };
    }
    return { kind: 'element', name: t.jsxIdentifier(typeArg.name) };
  }
  // Member expression => JSXMemberExpression, e.g. Context.Provider, A.B.C
  if (t.isMemberExpression(typeArg) && !typeArg.computed) {
    const member = memberToJsx(typeArg);
    if (member) return { kind: 'element', name: member };
  }
  // Anything else (computed member, call, etc.) can't be a JSX name -> bail.
  return null;
}

/** Recursively convert a (non-computed) MemberExpression into a JSXMemberExpression. */
function memberToJsx(node) {
  if (t.isIdentifier(node)) {
    return t.jsxIdentifier(node.name);
  }
  if (t.isMemberExpression(node) && !node.computed && t.isIdentifier(node.property)) {
    const object = memberToJsx(node.object);
    if (!object) return null;
    // JSXMemberExpression.object must be JSXMemberExpression or JSXIdentifier.
    if (!t.isJSXMemberExpression(object) && !t.isJSXIdentifier(object)) return null;
    return t.jsxMemberExpression(object, t.jsxIdentifier(node.property.name));
  }
  return null;
}

/**
 * Wrap an expression as a JSX child:
 *   - already-converted JSXElement/JSXFragment -> used directly
 *   - StringLiteral -> wrapped in a `{...}` container (JSXExpressionContainer)
 *     to be safe with quotes/braces/newlines/entities in the text
 *   - anything else -> `{expr}` container
 */
function exprToChild(node) {
  if (t.isJSXElement(node) || t.isJSXFragment(node)) {
    return node;
  }
  if (node == null) return null;
  // null/undefined literal children (e.g. `children: null`) -> emit `{null}`.
  return t.jsxExpressionContainer(node);
}

/** Convert an array of child expressions into JSX child nodes. */
function buildChildrenFromArray(elements) {
  const out = [];
  for (const el of elements) {
    if (el == null) continue; // holes in the array literal
    if (t.isSpreadElement(el)) {
      // {...children} spread inside a children array.
      out.push(t.jsxExpressionContainer(t.jsxSpreadChild(el.argument)));
      continue;
    }
    const child = exprToChild(el);
    if (child) out.push(child);
  }
  return out;
}

/** Convert a single `children` value (the ObjectProperty value) into JSX children. */
function buildChildren(childrenValue) {
  if (t.isArrayExpression(childrenValue)) {
    return buildChildrenFromArray(childrenValue.elements);
  }
  const child = exprToChild(childrenValue);
  return child ? [child] : [];
}

/**
 * Convert one props ObjectProperty (key/value) into a JSXAttribute, or push a
 * JSXSpreadAttribute for a SpreadElement. Returns true on success, false if the
 * property can't be safely represented as a JSX attribute (caller should bail).
 */
function propToAttribute(prop, attributes) {
  if (t.isSpreadElement(prop)) {
    attributes.push(t.jsxSpreadAttribute(prop.argument));
    return true;
  }
  if (!t.isObjectProperty(prop)) return false;
  if (prop.computed) return false; // computed keys can't be JSX attribute names

  // Resolve the attribute name. Identifier (foo), or string literal that is a
  // valid JSX attribute name — including hyphenated ones like
  // "data-mobileai-ignore" / "aria-label".
  let attrName;
  if (t.isIdentifier(prop.key)) {
    attrName = prop.key.name;
  } else if (t.isStringLiteral(prop.key)) {
    if (!isValidJsxAttributeName(prop.key.value)) return false;
    attrName = prop.key.value;
  } else {
    return false;
  }

  const value = prop.value;
  // StringLiteral value -> name="str" (but only if it round-trips cleanly as a
  // JSX attribute string; otherwise use a `{'...'}` container).
  if (t.isStringLiteral(value) && canBeJsxStringAttr(value.value)) {
    attributes.push(t.jsxAttribute(t.jsxIdentifier(attrName), t.stringLiteral(value.value)));
    return true;
  }
  // Boolean shorthand is intentionally NOT used — keep `foo={true}` explicit so
  // the regenerated output matches the original `foo: true` exactly.
  // Everything else -> name={expr}
  attributes.push(t.jsxAttribute(t.jsxIdentifier(attrName), t.jsxExpressionContainer(value)));
  return true;
}

/** JSX attribute names allow letters, digits, _, -, and : (namespaced). */
function isValidJsxAttributeName(name) {
  return /^[A-Za-z_][A-Za-z0-9_-]*(?::[A-Za-z_][A-Za-z0-9_-]*)?$/.test(name);
}

/**
 * A JSX string attribute value (name="...") cannot contain the delimiting quote,
 * and cannot contain `{` or `}` (those start expression containers in JSX text).
 * `&` is also avoided to be safe with entity parsing on the round-trip. If any of
 * these appear we fall back to a `{'...'}` expression container instead.
 */
function canBeJsxStringAttr(str) {
  return !/["{}&\n\r]/.test(str);
}

/**
 * Convert a single JSX runtime CallExpression node into a JSXElement/JSXFragment.
 * Returns the new node, or null to signal "leave the original call untouched".
 */
function convertCall(node) {
  const args = node.arguments;
  if (args.length === 0) return null;

  const typeArg = args[0];
  const nameInfo = buildJsxName(typeArg);
  if (!nameInfo) return null;

  const propsArg = args[1];
  const keyArg = args[2];

  const attributes = [];
  let childrenNodes = [];

  if (propsArg != null) {
    if (t.isObjectExpression(propsArg)) {
      for (const prop of propsArg.properties) {
        // Pull the `children` key out into JSX children; everything else is an attr.
        if (
          t.isObjectProperty(prop) &&
          !prop.computed &&
          ((t.isIdentifier(prop.key) && prop.key.name === 'children') ||
            (t.isStringLiteral(prop.key) && prop.key.value === 'children'))
        ) {
          childrenNodes = buildChildren(prop.value);
          continue;
        }
        if (!propToAttribute(prop, attributes)) return null; // bail on anything weird
      }
    } else if (t.isNullLiteral(propsArg) || (t.isIdentifier(propsArg) && propsArg.name === 'undefined')) {
      // _jsx(Comp, null) / _jsx(Comp, undefined) -> no attributes.
    } else {
      // 2nd arg is not an object literal (e.g. a variable holding props) ->
      // emit a single {...arg} spread.
      attributes.push(t.jsxSpreadAttribute(propsArg));
    }
  }

  // 3rd arg is the explicit key -> key={...} attribute.
  if (keyArg != null && !(t.isIdentifier(keyArg) && keyArg.name === 'undefined') && !t.isNullLiteral(keyArg)) {
    if (t.isStringLiteral(keyArg) && canBeJsxStringAttr(keyArg.value)) {
      attributes.push(t.jsxAttribute(t.jsxIdentifier('key'), t.stringLiteral(keyArg.value)));
    } else {
      attributes.push(t.jsxAttribute(t.jsxIdentifier('key'), t.jsxExpressionContainer(keyArg)));
    }
  }

  if (nameInfo.kind === 'fragment') {
    // Fragments take no attributes in the runtime form; if a key was present we
    // cannot express it on <>...</>, so bail to keep behavior identical.
    if (attributes.length > 0) return null;
    return t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), childrenNodes);
  }

  const selfClosing = childrenNodes.length === 0;
  const opening = t.jsxOpeningElement(nameInfo.name, attributes, selfClosing);
  const closing = selfClosing ? null : t.jsxClosingElement(nameInfo.name);
  return t.jsxElement(opening, closing, childrenNodes, selfClosing);
}

/** Strip a leading /*#__PURE__*\/ (and any) leading comments from a node. */
function stripLeadingComments(node) {
  if (node && node.leadingComments) node.leadingComments = [];
  // Babel also tracks comments in `.comments`/innerComments for some node kinds.
  if (node && node.innerComments) node.innerComments = [];
}

/**
 * Run the codemod on source `code`. Returns the transformed source string.
 */
async function transform(code, filename) {
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
    // Attach comments so we can detect/strip the /*#__PURE__*/ markers.
    attachComment: true,
  });

  let convertedAny = false;
  let remainingJsxCalls = 0;

  traverse(ast, {
    CallExpression: {
      exit(p) {
        if (!isJsxCall(p.node)) return;
        let replacement = null;
        try {
          replacement = convertCall(p.node);
        } catch (e) {
          replacement = null; // bail-safe: never emit broken output
        }
        if (!replacement) {
          remainingJsxCalls += 1;
          return; // leave the original call as-is
        }
        // Strip the /*#__PURE__*/ marker that prefixed the call.
        stripLeadingComments(p.node);
        // Carry over leading comments from the call onto the replacement? We
        // intentionally drop the PURE marker; JSX elements get their own.
        p.replaceWith(replacement);
        convertedAny = true;
      },
    },
  });

  // Decide whether to remove the `react/jsx-runtime` import. Only safe if no
  // unconverted jsx-runtime calls remain.
  let removeRuntimeImport = remainingJsxCalls === 0;

  if (removeRuntimeImport) {
    traverse(ast, {
      ImportDeclaration(p) {
        if (p.node.source.value === 'react/jsx-runtime') {
          p.remove();
        }
      },
    });
  }

  let output = generate(ast, {
    retainLines: false,
    comments: true,
    jsescOption: { minimal: true },
  }, code).code;

  // Format with prettier (babel parser handles JSX).
  output = await prettier.format(output, {
    parser: 'babel',
    printWidth: 120,
    singleQuote: true,
  });

  return { output, convertedAny, remainingJsxCalls };
}

// ---- CLI -------------------------------------------------------------------

const DEFAULT_FILES = [
  'module/web/blocks.js',
  'module/web/components/AIZoneWeb.js',
  'module/web/components/RichContentRendererWeb.js',
  'module/web/components/AIAgent.js',
];

async function main() {
  const argv = process.argv.slice(2);
  const files = argv.length > 0 ? argv : DEFAULT_FILES;
  const root = path.resolve('/Users/mohamedsalah/mobileai-suite-copy/mobileai-web');

  for (const rel of files) {
    const abs = path.isAbsolute(rel) ? rel : path.join(root, rel);
    const code = fs.readFileSync(abs, 'utf8');
    const { output, convertedAny, remainingJsxCalls } = await transform(code, abs);
    const outPath = abs.replace(/\.js$/, '.jsx');
    fs.writeFileSync(outPath, output, 'utf8');
    const status = remainingJsxCalls === 0 ? 'OK' : `WARN ${remainingJsxCalls} call(s) left unconverted`;
    console.log(
      `${path.relative(root, abs)} -> ${path.relative(root, outPath)}  [converted=${convertedAny} ${status}]`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export { transform };
