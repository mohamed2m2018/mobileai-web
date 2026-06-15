// verify-roundtrip.mjs
//
// Correctness gate for the JSX re-authoring. For each of the 4 web UI files,
// compares the esbuild-REGENERATED `.js` (lowered from the new `.jsx`) against the
// ORIGINAL hand-written `.js`. Both are normalized through prettier (babel parser)
// so only whitespace/formatting differences fall away — any remaining diff is a
// real semantic difference and a FAIL.
//
// The original files are read from a snapshot dir (default /tmp/jsx-roundtrip-orig)
// taken before the esbuild rebuild overwrote them.
//
// Usage: node scripts/verify-roundtrip.mjs [origSnapshotDir]

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const r = createRequire('/Users/mohamedsalah/mobileai-suite-copy/react-native-ai-agent/index.js');
const prettier = r('prettier');
const parser = r('@babel/parser');
const traverse = r('@babel/traverse').default;
const generate = r('@babel/generator').default;
const t = r('@babel/types');

const root = path.resolve('/Users/mohamedsalah/mobileai-suite-copy/mobileai-web');
const origDir = process.argv[2] || '/tmp/jsx-roundtrip-orig';

// jsx-runtime call helper names (already alias-renamed to their imported name by
// the time the CallExpression visitor below runs, but list every form to be safe).
const JSX_CALLEES = new Set(['_jsx', '_jsxs', '_jsxDEV', 'jsx', 'jsxs', 'jsxDEV']);

const FILES = [
  { regen: 'module/web/blocks.js', orig: 'blocks.js' },
  { regen: 'module/web/components/AIZoneWeb.js', orig: 'components/AIZoneWeb.js' },
  { regen: 'module/web/components/RichContentRendererWeb.js', orig: 'components/RichContentRendererWeb.js' },
  { regen: 'module/web/components/AIAgent.js', orig: 'components/AIAgent.js' },
];

// Canonicalize away every difference class that is purely cosmetic / a
// consequence of esbuild's codegen vs the original hand-written compiler output,
// while preserving anything that would change runtime behavior. Specifically:
//
//   (1) "use strict" directive — esbuild drops it from ESM output.
//   (2) import LOCAL-BINDING aliases — esbuild imports `{ jsx }`, the original
//       aliased `{ jsx as _jsx }`. We rewrite every imported specifier to its
//       imported (source) name and rename all references, so `_jsx(...)` and
//       `jsx(...)` collapse to the same canonical form.
//   (3) import-declaration ORDER — esbuild hoists react/jsx-runtime to the top.
//       We sort imports by their (post-rename) printed text.
//   (4) export STYLE — inline `export function Foo`/`export const Foo` vs a
//       consolidated `export { Foo, Bar }`. We strip the inline `export` keyword,
//       collect every exported name, and emit one sorted `export { ... }` block.
//
// Critically, the ORDER of ordinary body statements and the structure of the
// rendered JSX tree are left untouched — so a dropped element, reordered
// children, a changed/missing prop, or a different attribute still shows up as a
// diff. prettier-format at the end neutralizes whitespace and /*#__PURE__*/
// annotations.
function canonicalize(code) {
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
  });

  // (2) Rename imported specifiers to their source (imported) name everywhere,
  // then sort the specifiers within each import so `{ jsx, jsxs, Fragment }` and
  // `{ Fragment, jsx, jsxs }` collapse to the same canonical line.
  traverse(ast, {
    ImportDeclaration(p) {
      for (const spec of p.node.specifiers) {
        if (t.isImportSpecifier(spec) && t.isIdentifier(spec.imported)) {
          const importedName = spec.imported.name;
          if (spec.local.name !== importedName) {
            p.scope.rename(spec.local.name, importedName);
          }
        }
      }
      // Sort named specifiers (keep a leading default/namespace specifier first).
      const def = p.node.specifiers.filter((s) => !t.isImportSpecifier(s));
      const named = p.node.specifiers.filter((s) => t.isImportSpecifier(s));
      named.sort((a, b) => {
        const an = t.isIdentifier(a.imported) ? a.imported.name : '';
        const bn = t.isIdentifier(b.imported) ? b.imported.name : '';
        return an < bn ? -1 : an > bn ? 1 : 0;
      });
      p.node.specifiers = [...def, ...named];
    },
    // (5) Expand object-property shorthand: `{ foo }` -> `{ foo: foo }` so the
    // codegen choice (babel keeps shorthand, the hand-written output spelled it
    // out) doesn't register as a diff.
    ObjectProperty(p) {
      if (p.node.shorthand) {
        p.node.shorthand = false;
        // Clear the extra metadata babel uses to re-emit shorthand.
        if (p.node.extra) delete p.node.extra.shorthand;
      }
    },
    // (6) Normalize `void 0` -> `undefined` (esbuild emits `void 0`).
    UnaryExpression(p) {
      if (
        p.node.operator === 'void' &&
        t.isNumericLiteral(p.node.argument) &&
        p.node.argument.value === 0
      ) {
        p.replaceWith(t.identifier('undefined'));
      }
    },
    // (7) Drop the `extra.raw` source text on string literals so the printer
    // regenerates from the canonical `.value` — this collapses escape-style
    // differences like a raw `—` vs `—` (same string, different spelling).
    StringLiteral(p) {
      if (p.node.extra) delete p.node.extra.raw;
    },
    // (8) Same for numeric literals: drop `extra.raw` so `60_000` (separators)
    // and `6e4` (esbuild's exponential rewrite) both print as their canonical
    // decimal value. Numerically identical, textually different.
    NumericLiteral(p) {
      if (p.node.extra) delete p.node.extra.raw;
    },
    // (9) Template-literal quasis: the printer uses `.value.raw` (source
    // spelling), so a raw emoji `🎤` vs esbuild's `\u{1F3A4}` differs even though
    // `.value.cooked` is identical. Rewrite `raw` from `cooked`, re-escaping only
    // the template-literal-special characters, so both collapse to the same text.
    TemplateElement(p) {
      const cooked = p.node.value.cooked ?? '';
      const reRaw = cooked.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
      p.node.value.raw = reRaw;
    },
    // (10) `jsx` vs `jsxs`: the automatic-runtime compiler picks `jsxs` when the
    // children are a STATIC array and `jsx` otherwise — a runtime-identical
    // micro-optimization (jsxs only skips a dev-only key-warning check). The
    // original compiler and esbuild make this call differently for a Fragment
    // whose sole child is a conditional expression: orig emitted
    // `jsxs(Fragment, { children: [x] })`, esbuild emits `jsx(Fragment, { children: x })`.
    // Canonicalize: rename the callee to `jsx`, and unwrap a single-element
    // `children` array to the scalar element. A children array with 2+ elements
    // is left as an array, so reordered/dropped children still surface as a diff.
    CallExpression(p) {
      const callee = p.node.callee;
      if (!t.isIdentifier(callee) || !JSX_CALLEES.has(callee.name)) return;
      callee.name = 'jsx';
      const props = p.node.arguments[1];
      if (!t.isObjectExpression(props)) return;
      for (const prop of props.properties) {
        if (
          t.isObjectProperty(prop) &&
          !prop.computed &&
          ((t.isIdentifier(prop.key) && prop.key.name === 'children') ||
            (t.isStringLiteral(prop.key) && prop.key.value === 'children')) &&
          t.isArrayExpression(prop.value) &&
          prop.value.elements.length === 1 &&
          prop.value.elements[0] != null &&
          !t.isSpreadElement(prop.value.elements[0])
        ) {
          prop.value = prop.value.elements[0];
        }
      }
    },
  });

  const program = ast.program;
  // (1) Drop "use strict".
  program.directives = (program.directives || []).filter((d) => d.value && d.value.value !== 'use strict');

  const imports = [];
  const rest = [];
  const exportedNames = new Set();

  for (const node of program.body) {
    if (t.isImportDeclaration(node)) {
      imports.push(node);
      continue;
    }
    // (4) Normalize export style.
    if (t.isExportNamedDeclaration(node)) {
      if (node.declaration) {
        // `export function Foo() {}` / `export const a = ..., b = ...`
        const decl = node.declaration;
        if (t.isFunctionDeclaration(decl) || t.isClassDeclaration(decl)) {
          if (decl.id) exportedNames.add(decl.id.name);
        } else if (t.isVariableDeclaration(decl)) {
          for (const d of decl.declarations) {
            if (t.isIdentifier(d.id)) exportedNames.add(d.id.name);
          }
        }
        rest.push(decl); // keep the declaration, strip the `export`
      } else {
        // `export { a, b as c }` (no re-export source assumed here)
        for (const spec of node.specifiers) {
          if (t.isExportSpecifier(spec) && t.isIdentifier(spec.exported)) {
            exportedNames.add(spec.exported.name);
          }
        }
      }
      continue;
    }
    rest.push(node);
  }

  // (3) Sort imports deterministically by printed text.
  imports.sort((a, b) => {
    const sa = generate(a).code;
    const sb = generate(b).code;
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });

  // One consolidated, sorted export block.
  const sortedExports = [...exportedNames].sort();
  const exportBlock =
    sortedExports.length > 0
      ? [t.exportNamedDeclaration(null, sortedExports.map((n) => t.exportSpecifier(t.identifier(n), t.identifier(n))))]
      : [];

  program.body = [...imports, ...rest, ...exportBlock];
  return ast;
}

async function normalize(code) {
  const ast = canonicalize(code);
  const regenerated = generate(ast, { comments: false }).code;
  return prettier.format(regenerated, { parser: 'babel', printWidth: 120, singleQuote: true });
}

// Tiny line-based diff for reporting (first N differing hunks).
function firstDiffs(a, b, maxLines = 12) {
  const la = a.split('\n');
  const lb = b.split('\n');
  const out = [];
  const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n && out.length < maxLines; i++) {
    if (la[i] !== lb[i]) {
      out.push(`  L${i + 1}`);
      out.push(`   - orig:  ${JSON.stringify(la[i] ?? '<eof>')}`);
      out.push(`   + regen: ${JSON.stringify(lb[i] ?? '<eof>')}`);
    }
  }
  return out.join('\n');
}

let allPass = true;
const results = [];

for (const f of FILES) {
  const regenPath = path.join(root, f.regen);
  const origPath = path.join(origDir, f.orig);
  if (!fs.existsSync(origPath)) {
    console.error(`MISSING original snapshot: ${origPath}`);
    allPass = false;
    results.push({ file: f.regen, status: 'MISSING ORIGINAL' });
    continue;
  }
  const regenNorm = await normalize(fs.readFileSync(regenPath, 'utf8'));
  const origNorm = await normalize(fs.readFileSync(origPath, 'utf8'));

  if (regenNorm === origNorm) {
    results.push({ file: f.regen, status: 'PASS (identical after normalize)' });
  } else {
    allPass = false;
    results.push({ file: f.regen, status: 'FAIL (semantic diff)', diff: firstDiffs(origNorm, regenNorm) });
  }
}

console.log('\n=== ROUND-TRIP VERIFY ===');
for (const res of results) {
  console.log(`\n${res.status}  ${res.file}`);
  if (res.diff) console.log(res.diff);
}
console.log(`\n${allPass ? 'ALL FILES ROUND-TRIP CLEAN ✓' : 'ROUND-TRIP FAILED ✗'}`);
process.exit(allPass ? 0 : 1);
