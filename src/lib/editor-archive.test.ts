import assert from "node:assert/strict";
import test from "node:test";
import { findIndexFile, relativeZipReference, resolveZipReference } from "./editor-archive";

test("findIndexFile prefers the shallowest site entry", () => {
  assert.equal(findIndexFile(["site/demo/index.html", "site/index.html", "notes.txt"]), "site/index.html");
});

test("resolveZipReference handles parent folders and query strings", () => {
  assert.equal(resolveZipReference("site/pages/index.html", "../assets/hero.jpg?v=2"), "site/assets/hero.jpg");
  assert.equal(resolveZipReference("index.html", "https://example.com/a.jpg"), null);
});

test("relativeZipReference produces a portable archive path", () => {
  assert.equal(relativeZipReference("site/index.html", "site/assets/editor-uploads/photo.png"), "assets/editor-uploads/photo.png");
});
