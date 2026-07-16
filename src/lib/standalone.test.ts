import assert from "node:assert/strict";
import test from "node:test";
import * as cheerio from "cheerio";
import { externalDependencies, isIntentionalRuntimeExternal, removeWordPressDiscoveryMarkup, scrubExternalDependencies, stripExternalMarkupComments } from "./standalone";

test("removes WordPress discovery and API metadata while retaining localizable social images",()=>{
  const $=cheerio.load(`<head><link rel="canonical" href="https://site.test/"><link rel="alternate" type="application/rss+xml" href="https://site.test/feed/"><link rel="https://api.w.org/" href="https://site.test/wp-json/"><link rel="stylesheet" href="assets/site.css"><meta property="og:image" content="https://site.test/a.png"></head>`);
  removeWordPressDiscoveryMarkup($);
  assert.equal($("link").length,1);
  assert.equal($("link").attr("href"),"assets/site.css");
  assert.equal($("meta[property^='og:']").length,1);
});

test("scrubs unresolved external dependencies but preserves intentional runtimes",()=>{
  const $=cheerio.load(`<head><meta name="msapplication-TileImage" content="https://site.test/tile.png"></head><body><a href="https://site.test/page">page</a><img src="https://site.test/a.png" data-api="https://site.test/wp-json/"><iframe src="https://remote.test/widget"></iframe><script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script><script src="https://centralcrm.kimzahost.website/wp-json/centralcrm/v1/loader.js?token=x"></script></body>`);
  scrubExternalDependencies($);
  assert.equal($("a").attr("href"),undefined);
  assert.equal($("img").attr("src"),undefined);
  assert.equal($("iframe").length,0);
  assert.equal($("meta").attr("content"),undefined);
  assert.equal($("img").attr("data-api"),undefined);
  assert.equal($("script").length,2);
  assert.equal(isIntentionalRuntimeExternal($("script").first().attr("src") || ""),true);
});

test("audits HTML and CSS external dependencies",()=>{
  const values=externalDependencies(`<img src="https://site.test/a.png"><style>.x{background:url(https://site.test/b.png)}@import "https://site.test/c.css";</style>`);
  assert.deepEqual(values,["https://site.test/a.png","https://site.test/b.png","https://site.test/c.css"]);
});

test("removes obsolete conditional comments with remote WordPress stylesheets",()=>{
  const html=stripExternalMarkupComments(`<!--[if lt IE 9]><link rel="stylesheet" href="https://site.test/wp-content/ie.css"><![endif]--><main>OK</main>`);
  assert.equal(html,"<main>OK</main>");
});
