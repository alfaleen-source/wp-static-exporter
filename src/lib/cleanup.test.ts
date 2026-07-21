import assert from "node:assert/strict";
import test from "node:test";
import { BUNDLED_FONT_NAMES } from "./css";
import { cleanupExport } from "./cleanup";

function fonts(){return new Map(BUNDLED_FONT_NAMES.map((name,index)=>[name,Buffer.from(`font-${index}`)]));}

test("keeps referenced assets, removes unreachable assets, and retains uncertain CSS",()=>{
  const result=cleanupExport(new Map([
    ["index.html",Buffer.from('<!doctype html><html><head><link rel="stylesheet" href="assets/site.css"></head><body><img src="assets/hero.png"></body></html>')],
    ["assets/site.css",Buffer.from('.hero{background:url("bg.png")}')],
    ["assets/unused.css",Buffer.from('.future{background:url("future.png")}')],
    ["assets/hero.png",Buffer.from("hero")],["assets/bg.png",Buffer.from("bg")],["assets/future.png",Buffer.from("future")],["assets/orphan.png",Buffer.from("orphan")],
  ]),fonts());
  assert(result.files.has("assets/hero.png"));assert(result.files.has("assets/bg.png"));assert(result.files.has("assets/unused.css"));assert(result.files.has("assets/future.png"));assert(!result.files.has("assets/orphan.png"));
  assert.deepEqual(result.report.retainedCssCandidates.map((item)=>item.path),["assets/unused.css"]);
});

test("replaces all old font faces and font files with canonical SCDream woff2",()=>{
  const result=cleanupExport(new Map([
    ["index.html",Buffer.from('<html><head><link rel="stylesheet" href="assets/fonts.css"><link rel="stylesheet" href="assets/mixed.css"></head><body></body></html>')],
    ["assets/fonts.css",Buffer.from('@font-face{font-family:Roboto;src:url(roboto.woff2)}')],
    ["assets/mixed.css",Buffer.from('@font-face{font-family:Icons;src:url(icons.woff)}.button{color:red}')],
    ["assets/roboto.woff2",Buffer.from("roboto")],["assets/icons.woff",Buffer.from("icons")],
  ]),fonts());
  const html=result.files.get("index.html")!.toString();const mixed=result.files.get("assets/mixed.css")!.toString();const overrides=result.files.get("assets/static-overrides.css")!.toString();
  assert(!result.files.has("assets/fonts.css"));assert(!result.files.has("assets/roboto.woff2"));assert(!result.files.has("assets/icons.woff"));assert.doesNotMatch(html,/fonts\.css/);assert.doesNotMatch(mixed,/@font-face/);assert.match(mixed,/\.button/);
  for(const name of BUNDLED_FONT_NAMES)assert(result.files.has(`assets/${name}`));
  assert.match(overrides,/font-family: 'SCDream'/);assert.match(overrides,/font-weight: 900/);
});

test("rejects inputs without index.html",()=>{
  assert.throws(()=>cleanupExport(new Map([["page.txt",Buffer.from("x")]]),fonts()),/index\.html/);
});

test("tolerates malformed third-party CSS and reports a warning instead of stopping cleanup",()=>{
  const result=cleanupExport(new Map([
    ["index.html",Buffer.from('<html><head><link rel="stylesheet" href="assets/broken.css"></head><body></body></html>')],
    ["assets/broken.css",Buffer.from('@font-face{font-family:"Roboto";src:url(roboto.woff2)}\n.valid{color:red}\n.broken{color blue}')],
    ["assets/roboto.woff2",Buffer.from("roboto")],
  ]),fonts());
  const css=result.files.get("assets/broken.css")!.toString();
  assert.doesNotMatch(css,/@font-face/);assert.match(css,/\.valid\{color:red\}/);assert.match(css,/\.broken\{color blue\}/);
  assert(!result.files.has("assets/roboto.woff2"));assert(result.report.warnings.some((warning)=>warning.includes("assets/broken.css contains malformed CSS")));
});
