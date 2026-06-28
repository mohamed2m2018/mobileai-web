import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { findSubmitControl } from "../module/web/core/domSubmit.js";

// findSubmitControl backs the formless-search fix: a search box with no <form> ignores a
// synthetic Enter, so we click its submit/search button instead. These assert the structural
// finder against realistic search-box DOM (no label-keyword guessing).

const dom = (html) => new JSDOM(`<!doctype html><html><body>${html}</body></html>`).window.document;

test("finds a sibling search button when the input has no form", () => {
  const doc = dom(`<div class="searchbar"><input id="q" type="text"><button id="go">🔍</button></div>`);
  const btn = findSubmitControl(doc.getElementById("q"));
  assert.equal(btn?.id, "go");
});

test("prefers an explicit submit control over other buttons", () => {
  const doc = dom(`<div><button id="clear">x</button><input id="q"><button id="go" type="submit">Search</button></div>`);
  const btn = findSubmitControl(doc.getElementById("q"));
  assert.equal(btn?.id, "go", "explicit type=submit wins over the clear button");
});

test("uses a role=search container scope", () => {
  const doc = dom(`<div role="search"><span><input id="q"></span><div role="button" id="go">Go</div></div>`);
  const btn = findSubmitControl(doc.getElementById("q"));
  assert.equal(btn?.id, "go");
});

test("walks up a few levels to find the wrapping button", () => {
  const doc = dom(`<div id="wrap"><div><div><input id="q"></div></div><button id="go">Search</button></div>`);
  const btn = findSubmitControl(doc.getElementById("q"));
  assert.equal(btn?.id, "go");
});

test("returns null when there is genuinely no submit control (no false click target)", () => {
  const doc = dom(`<div><input id="q"><p>no buttons here</p></div>`);
  assert.equal(findSubmitControl(doc.getElementById("q")), null);
});

test("never returns the input itself", () => {
  const doc = dom(`<div><input id="q" type="submit"></div>`);
  // the only submit-ish element is the input itself — must not target it
  assert.equal(findSubmitControl(doc.getElementById("q")), null);
});
