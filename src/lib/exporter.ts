import chromium from "@sparticuz/chromium";
import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import type { AnyNode } from "domhandler";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";
import { html as beautifyHtml } from "js-beautify";
import { chromium as playwright, request as playwrightRequest, type Browser, type Page } from "playwright-core";
import { BUNDLED_FONT_NAMES, bundledSCoreFontName, isRemoteFontStylesheet, isWebFontUrl, normalizeFullWidthBackgroundStyle, rewriteCssAssetUrls, S_CORE_FONT_FACES, type CssLocation } from "./css";
import { assertDesignAssetPayload } from "./asset-validation";
import { cleanupReportHtml } from "./cleanup";
import { cleanupFileMap } from "./cleanup-package";
import { centralCrmLoaderUrl, centralCrmPlaceholder } from "./crm";
import { assertSafePublicUrl, safeOutputName } from "./security";
import { stripNonGoogleScriptsFromHtml } from "./scripts";
import { externalDependencies, isIntentionalRuntimeExternal, removeWordPressDiscoveryMarkup, scrubExternalDependencies, stripExternalMarkupComments } from "./standalone";
import { normalizeStaticWidgets } from "./static-widgets";

const MAX_ASSET_BYTES = 18 * 1024 * 1024;
const MAX_TOTAL_BYTES = 90 * 1024 * 1024;
const MAX_ASSETS = 450;
export const STATIC_OVERRIDES = `/* Canonical bundled S-Core Dream font family. */
${S_CORE_FONT_FACES}

/* Static-export responsive safeguards. Loaded last on purpose. */
html, body { max-width: 100%; overflow-x: hidden; }
@supports (overflow: clip) { html, body { overflow-x: clip; } }
.upb_row_bg[data-bg-override="full"] {
  min-width: 100vw !important;
  width: 100vw !important;
  left: 50% !important;
  right: auto !important;
  margin-left: -50vw !important;
}

/* Script-free Ultimate Addons horizontal carousel. */
[data-static-carousel] .slick-list {
  width: 100% !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
}
[data-static-carousel] .slick-list::-webkit-scrollbar { display: none; }
[data-static-carousel] .slick-track {
  width: 100% !important;
  transform: none !important;
  display: grid !important;
  grid-auto-flow: column;
  grid-auto-columns: calc((100% - 60px) / 3);
  gap: 30px;
}
[data-static-carousel] .slick-track::before,
[data-static-carousel] .slick-track::after { display: none !important; }
[data-static-carousel] .slick-slide {
  display: block !important;
  float: none !important;
  width: auto !important;
  min-width: 0 !important;
  margin: 0 !important;
  scroll-snap-align: start;
}
[data-static-carousel] .slick-cloned { display: none !important; }
@media (max-width: 991px) {
  [data-static-carousel] .slick-track { grid-auto-columns: calc((100% - 30px) / 2); }
}
@media (max-width: 767px) {
  .vc_hidden-xs { display: none !important; }
  [data-static-carousel] .slick-track { grid-auto-columns: 100%; gap: 15px; }
}
@media (min-width: 768px) and (max-width: 991px) { .vc_hidden-sm { display: none !important; } }
@media (min-width: 992px) and (max-width: 1199px) { .vc_hidden-md { display: none !important; } }
@media (min-width: 1200px) { .vc_hidden-lg { display: none !important; } }
`;

type Summary = { assets:number; cssFiles:number; crmForms:number; removedScripts:number; bytes:number; warnings:string[] };
export type ExportPackage = { zip: Buffer; filename:string; summary:Summary; report:string };

const CAPTURE_VIEWPORTS = [
  { name:"desktop", width:1440, height:1100 },
  { name:"tablet", width:834, height:1112 },
  { name:"mobile", width:390, height:844 },
] as const;

function isGoogleTrackingScript(node: cheerio.Cheerio<AnyNode>) {
  const src=(node.attr("src") || "").toLowerCase();
  const body=node.html() || "";
  return /(?:googletagmanager\.com|google-analytics\.com|googleadservices\.com|doubleclick\.net|googlesyndication\.com|google\.com\/(?:pagead|ads|conversion))/.test(src)
    || /(?:\bgtag\s*\(|\bdataLayer\b|googletagmanager|google-analytics|googleadservices|google_conversion|googleads)/i.test(body);
}

function crmSignature(html:string) {
  const view=cheerio.load(html);
  return view("[data-crm-token], [id^='crm-form-']").toArray().map((element) => {
    const node=view(element);
    const token=node.attr("data-crm-token") || node.attr("id")?.replace(/^crm-form-/,"") || "";
    const loan=node.attr("data-loantype") || node.find('input[name="loan_type"]').attr("value") || "상담신청";
    return `${token}|${loan}`;
  });
}

function extensionFor(url: URL, contentType: string) {
  const pathExt = url.pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (pathExt) return pathExt;
  const mime = contentType.split(";")[0].trim();
  return ({ "text/css":"css", "image/jpeg":"jpg", "image/png":"png", "image/gif":"gif", "image/webp":"webp", "image/svg+xml":"svg", "image/x-icon":"ico", "font/woff":"woff", "font/woff2":"woff2", "font/ttf":"ttf", "font/otf":"otf", "application/pdf":"pdf" } as Record<string,string>)[mime] || "bin";
}

function assetName(url: URL, contentType: string) {
  const ext = extensionFor(url, contentType);
  const base = decodeURIComponent(url.pathname.split("/").pop() || "asset").replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").slice(0, 45) || "asset";
  const hash = createHash("sha1").update(url.href).digest("hex").slice(0, 9);
  return `${base}-${hash}.${ext}`;
}

export async function launchBrowser(): Promise<Browser> {
  const localCandidates = process.platform === "win32" ? ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"] : ["/usr/bin/google-chrome", "/usr/bin/chromium"];
  const local = localCandidates.find(existsSync);
  return playwright.launch({ args: process.env.VERCEL ? chromium.args : ["--disable-gpu", "--no-sandbox"], executablePath: local || await chromium.executablePath(), headless:true });
}

async function scrollPage(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let y = 0; const distance = 700; const timer = setInterval(() => { const height = document.documentElement.scrollHeight; window.scrollTo(0, y += distance); if (y >= height - innerHeight) { clearInterval(timer); window.scrollTo(0, 0); resolve(); } }, 90);
      setTimeout(() => { clearInterval(timer); window.scrollTo(0, 0); resolve(); }, 9000);
    });
  });
  await page.waitForTimeout(1200);
}

export async function exportStaticSite(inputUrl: string, requestedName: string): Promise<ExportPackage> {
  const initialUrl = await assertSafePublicUrl(inputUrl);
  const warnings: string[] = [];
  let browser: Browser | undefined;
  let renderedHtml = "";
  let finalUrl = initialUrl;
  let sessionCookie = "";

  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport:{ width:1440, height:1100 }, deviceScaleFactor:1, userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36 WPStaticExporter/1.0" });
    const safety = new Map<string, Promise<boolean>>();
    await context.route("**/*", async (route) => {
      const requestUrl = route.request().url();
      if (/^(data:|blob:|about:)/i.test(requestUrl)) return route.continue();
      try {
        const host = new URL(requestUrl).hostname;
        if (!safety.has(host)) safety.set(host, assertSafePublicUrl(requestUrl).then(() => true).catch(() => false));
        return (await safety.get(host)) ? route.continue() : route.abort("blockedbyclient");
      } catch { return route.abort("blockedbyclient"); }
    });
    const captures = new Map<string,string>();
    for (const viewport of CAPTURE_VIEWPORTS) {
      const page = await context.newPage();
      await page.setViewportSize({ width:viewport.width, height:viewport.height });
      await page.goto(initialUrl.href, { waitUntil:"domcontentloaded", timeout:60000 });
      await page.waitForLoadState("networkidle", { timeout:15000 }).catch(() => warnings.push(`${viewport.name}: the source kept making network requests; capture continued after the wait limit.`));
      await page.waitForTimeout(1200);
      await scrollPage(page);
      if (viewport.name === "desktop") finalUrl = await assertSafePublicUrl(page.url());
      captures.set(viewport.name,await page.content());
      await page.close();
    }
    renderedHtml = captures.get("desktop") || "";
    const responsiveCrm = CAPTURE_VIEWPORTS.map(({name})=>({ name, signature:crmSignature(captures.get(name) || "") }));
    const baseline=JSON.stringify(responsiveCrm[0].signature);
    const mismatch=responsiveCrm.find((capture)=>JSON.stringify(capture.signature)!==baseline);
    if(mismatch) {
      throw new Error(`Responsive CRM audit failed: desktop, tablet, and mobile do not contain the same ordered form tokens. ${responsiveCrm.map((capture)=>`${capture.name}=${capture.signature.length}`).join(", ")}. Export stopped to prevent an incomplete responsive copy.`);
    }
    const cookies=await context.cookies();
    sessionCookie=cookies.map((cookie)=>`${cookie.name}=${cookie.value}`).join("; ");
  } finally { await browser?.close(); }

  const strippedScripts=stripNonGoogleScriptsFromHtml(renderedHtml);
  renderedHtml=strippedScripts.html;
  const $ = cheerio.load(renderedHtml);
  let removedScripts = strippedScripts.removed;
  const crmTokens = new Map<string,string>();
  removeWordPressDiscoveryMarkup($);

  $("[data-crm-token], [id^='crm-form-']").each((_, element) => {
    const wrapper = $(element); const token = wrapper.attr("data-crm-token") || wrapper.attr("id")?.replace(/^crm-form-/i,"");
    if (!token || !/^[a-f0-9]{40}$/i.test(token)) return;
    const loanType = wrapper.attr("data-loantype") || wrapper.find('input[name="loan_type"]').attr("value") || "상담신청";
    crmTokens.set(token, loanType);
    wrapper.replaceWith(centralCrmPlaceholder(token,loanType));
  });
  $("script").each((_,element)=>{ const node=$(element); if(!isGoogleTrackingScript(node)) { node.remove(); removedScripts++; } });
  $("noscript").each((_,element)=>{ const node=$(element); if(!/(?:googletagmanager|google-analytics|googleadservices|doubleclick|googleads)/i.test(node.html() || "")) node.remove(); });
  $('link[rel="preload"][as="script"],link[rel="modulepreload"]').remove();
  $("*").each((_, element) => { for (const attr of Object.keys((element as unknown as { attribs?:Record<string,string> }).attribs || {})) if (/^on/i.test(attr)) $(element).removeAttr(attr); });
  $(".elementor-invisible").removeClass("elementor-invisible");

  const zip = new JSZip();
  const assetsFolder = zip.folder("assets")!;
  for(const name of BUNDLED_FONT_NAMES) assetsFolder.file(name,await readFile(join(process.cwd(),"bundled-fonts",name)));
  const requestContext = await playwrightRequest.newContext({ ignoreHTTPSErrors:true, userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36 WPStaticExporter/1.0", extraHTTPHeaders:{ referer:finalUrl.origin+"/", ...(sessionCookie?{cookie:sessionCookie}:{}) } });
  const localized = new Map<string,string>();
  const failed = new Set<string>();
  let totalBytes = 0;
  let cssFiles = 0;

  async function localizeCss(css: string, cssUrl: URL, location:CssLocation): Promise<string> {
    return rewriteCssAssetUrls(css,cssUrl,location,localize,true);
  }

  async function localize(url: URL): Promise<string> {
    const bundledFont=bundledSCoreFontName(url);
    if(bundledFont) return `assets/${bundledFont}`;
    if(isWebFontUrl(url)) throw new Error("non-SCDream web font omitted");
    const fragment=url.hash;
    const key = url.href.split("#")[0];
    if (localized.has(key)) return `${localized.get(key)!}${fragment}`;
    if (localized.size >= MAX_ASSETS) throw new Error(`Asset safety limit reached (${MAX_ASSETS}).`);
    let current = new URL(key);
    let response;
    for (let redirect = 0; redirect <= 5; redirect++) {
      await assertSafePublicUrl(current.href);
      response = await requestContext.get(current.href, { timeout:30000, maxRedirects:0, headers:{ accept:"*/*" } });
      if (response.status() < 300 || response.status() >= 400) break;
      const location = response.headers()["location"];
      await response.dispose();
      if (!location) throw new Error(`HTTP ${response.status()} without redirect location`);
      current = new URL(location,current);
    }
    if (!response) throw new Error("asset request failed");
    if (!response.ok()) { const status=response.status(); await response.dispose(); throw new Error(`HTTP ${status}`); }
    const headers=response.headers();
    const length = Number(headers["content-length"] || 0);
    if (length > MAX_ASSET_BYTES) throw new Error("asset exceeds 18 MB");
    const buffer = await response.body();
    if (buffer.length > MAX_ASSET_BYTES || totalBytes + buffer.length > MAX_TOTAL_BYTES) throw new Error("asset package safety limit exceeded");
    const finalAssetUrl = current;
    const contentType = headers["content-type"] || "application/octet-stream";
    await response.dispose();
    if(/^font\//i.test(contentType)) throw new Error("non-SCDream web font omitted");
    assertDesignAssetPayload(buffer,contentType,finalAssetUrl);
    const name = assetName(finalAssetUrl, contentType);
    const path = `assets/${name}`;
    localized.set(key, path); totalBytes += buffer.length;
    if (contentType.toLowerCase().includes("text/css") || name.endsWith(".css")) { cssFiles++; assetsFolder.file(name, await localizeCss(buffer.toString("utf8"), finalAssetUrl,"asset")); }
    else assetsFolder.file(name, buffer);
    return `${path}${fragment}`;
  }

  async function tryLocalize(raw: string, base = finalUrl) {
    if (!raw || /^(data:|blob:|#|mailto:|tel:|javascript:)/i.test(raw)) return raw;
    try { return await localize(new URL(raw, base)); }
    catch (cause) { const label = `${raw} — ${cause instanceof Error ? cause.message : "download failed"}`; if (!failed.has(label)) { failed.add(label); warnings.push(label); } return raw; }
  }

  for (const element of $("link[href]").toArray()) {
    const node=$(element); const rel=(node.attr("rel") || "").toLowerCase(); const as=(node.attr("as") || "").toLowerCase();
    if(!/(?:stylesheet|icon|apple-touch-icon|mask-icon|fluid-icon)/.test(rel) && !(rel.includes("preload")&&/(?:style|image|font)/.test(as)))continue;
    const href=node.attr("href");
    if(href){try{if(rel.includes("stylesheet")&&isRemoteFontStylesheet(new URL(href,finalUrl))){node.remove();continue;}}catch{/* handled by localization */}node.attr("href",await tryLocalize(href));}
  }
  for(const element of $("meta[content]").toArray()) {
    const node=$(element); const name=(node.attr("name") || "").toLowerCase(); const property=(node.attr("property") || "").toLowerCase();
    if(!/(?:tileimage|image|icon|logo)/.test(`${name} ${property}`))continue;
    const content=node.attr("content"); if(content&&/^https?:\/\//i.test(content))node.attr("content",await tryLocalize(content));
  }
  const assetAttributes:[string,string][]=[
    ["img[src]","src"],["img[data-src]","data-src"],["img[data-lazy-src]","data-lazy-src"],["img[data-original]","data-original"],
    ["source[src]","src"],["video[poster]","poster"],["audio[src]","src"],["video[src]","src"],["input[type='image'][src]","src"],
    ["[background]","background"],["svg image[href]","href"],["svg image[xlink\\:href]","xlink:href"],["svg use[href]","href"],["svg use[xlink\\:href]","xlink:href"],
  ];
  for (const [selector,attr] of assetAttributes) {
    for (const element of $(selector).toArray()) { const node=$(element); const value=node.attr(attr); if(value)node.attr(attr,await tryLocalize(value)); }
  }
  for(const attr of ["data-bg","data-background","data-background-image","data-lazy-bg"]) {
    for(const element of $(`[${attr}]`).toArray()) {
      const node=$(element); const value=node.attr(attr); if(!value)continue;
      node.attr(attr,/url\s*\(/i.test(value) ? await localizeCss(value,finalUrl,"html") : await tryLocalize(value));
    }
  }
  for (const element of $("[srcset],[data-srcset]").toArray()) {
    const node=$(element); const attr=node.attr("srcset")!==undefined?"srcset":"data-srcset"; const srcset=node.attr(attr) || ""; if(/^data:/i.test(srcset.trim()))continue; const parts=[];
    for (const part of srcset.split(",")) { const bits=part.trim().split(/\s+/); const url=bits.shift(); if(url) parts.push(`${await tryLocalize(url)} ${bits.join(" ")}`.trim()); }
    node.attr(attr,parts.join(", "));
  }
  for (const element of $("style").toArray()) { const node=$(element); node.text(await localizeCss(node.text(),finalUrl,"html")); }
  for (const element of $("[style]").toArray()) { const node=$(element); const style=node.attr("style"); if(style) node.attr("style",await localizeCss(style,finalUrl,"html")); }

  // Ultimate Addons calculates these values in JavaScript for the capture viewport.
  // Replace the frozen desktop pixels with the plugin's viewport-independent full-bleed form.
  $('.upb_row_bg[data-bg-override="full"]').each((_,element)=>{
    const node=$(element);
    node.attr("style",normalizeFullWidthBackgroundStyle(node.attr("style") || ""));
  });
  normalizeStaticWidgets($);
  assetsFolder.file("static-overrides.css",STATIC_OVERRIDES);
  cssFiles++;
  $("head").append('\n<link rel="stylesheet" href="assets/static-overrides.css" data-static-exporter="responsive-safeguards">\n');

  $("body").prepend("\n<!-- ========== PAGE START ========== -->\n");
  $("header").first().before("\n<!-- ========== SITE HEADER ========== -->\n");
  const main=$("main").first(); if(main.length) main.before("\n<!-- ========== MAIN CONTENT ========== -->\n"); else $("#content").first().before("\n<!-- ========== MAIN CONTENT ========== -->\n");
  $("section").each((_,element)=>{ const node=$(element); const label=node.attr("aria-label")||node.attr("id")||node.attr("class")?.split(/\s+/).slice(0,2).join(" "); if(label) node.before(`\n<!-- ========== SECTION: ${label} ========== -->\n`); });
  $("footer").first().before("\n<!-- ========== SITE FOOTER ========== -->\n");
  $("[data-crm-token]").each((_,element)=>{ const node=$(element); node.before(`\n<!-- ========== CENTRAL CRM FORM: ${node.attr("data-loantype") || "상담신청"} ========== -->\n`); });
  if (crmTokens.size) {
    const tokens=[...crmTokens.keys()];
    const loader=centralCrmLoaderUrl(tokens);
    $("body").append(`\n<!-- ========== CENTRAL CRM LOADERS ========== -->\n<script src="${loader}" async></script>\n`);
  }
  scrubExternalDependencies($);

  let output = stripExternalMarkupComments($.html());
  output = beautifyHtml(output, { indent_size:2, wrap_line_length:140, max_preserve_newlines:1, end_with_newline:true, content_unformatted:["pre","textarea"] });
  const name = safeOutputName(requestedName, finalUrl.hostname.replace(/^www\./,""));
  const auditedExternal=externalDependencies(output);
  const residualExternal=auditedExternal.filter((value)=>!isIntentionalRuntimeExternal(value));
  if(residualExternal.length)throw new Error(`Standalone dependency audit failed: ${residualExternal.slice(0,5).join(", ")}`);
  const external = auditedExternal.filter(isIntentionalRuntimeExternal);
  zip.file("index.html",output);
  const generatedFiles=new Map<string,Buffer>();
  for(const entry of Object.values(zip.files))if(!entry.dir)generatedFiles.set(entry.name,await entry.async("nodebuffer"));
  const cleaned=await cleanupFileMap(generatedFiles);
  warnings.push(...cleaned.report.warnings);
  const assetCount=[...cleaned.files.keys()].filter((path)=>path.startsWith("assets/")).length;
  cssFiles=[...cleaned.files.keys()].filter((path)=>path.toLowerCase().endsWith(".css")).length;
  const report = buildReport({ source:initialUrl.href, final:finalUrl.href, name, assets:assetCount, cssFiles, crmForms:$("[data-crm-token]").length, removedScripts, warnings, external });
  const outputZip=new JSZip();for(const [path,buffer] of cleaned.files)outputZip.file(path,buffer);
  outputZip.file("export-report.html",report);
  outputZip.file("cleanup-report.html",cleanupReportHtml(cleaned.report));
  outputZip.file("cleanup-report.json",JSON.stringify(cleaned.report,null,2));
  const zipBuffer = await outputZip.generateAsync({ type:"nodebuffer", compression:"DEFLATE", compressionOptions:{ level:7 } });
  await requestContext.dispose();
  const filename=`${name}.zip`;
  return { zip:zipBuffer, filename, report, summary:{ assets:assetCount, cssFiles, crmForms:$("[data-crm-token]").length, removedScripts, bytes:zipBuffer.length, warnings } };
}

function buildReport(data:{source:string;final:string;name:string;assets:number;cssFiles:number;crmForms:number;removedScripts:number;warnings:string[];external:string[]}) {
  const esc=(v:string)=>v.replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
  const list=(items:string[])=>items.length?`<ul>${items.map((x)=>`<li>${esc(x)}</li>`).join("")}</ul>`:"<p>None</p>";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Export report — ${esc(data.name)}</title><style>body{font:15px/1.6 Arial;max-width:900px;margin:50px auto;padding:0 24px;color:#25283b}h1{font-size:30px}h2{margin-top:32px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.grid div{padding:18px;background:#f3f3f9;border-radius:10px}.grid b,.grid span{display:block}.grid b{font-size:22px}code{word-break:break-all}@media(max-width:650px){.grid{grid-template-columns:1fr 1fr}}</style></head><body><h1>Static export report</h1><p><b>Source:</b> <code>${esc(data.source)}</code><br><b>Captured:</b> <code>${esc(data.final)}</code><br><b>Generated:</b> ${new Date().toISOString()}</p><div class="grid"><div><b>${data.assets}</b><span>assets</span></div><div><b>${data.cssFiles}</b><span>CSS files</span></div><div><b>${data.crmForms}</b><span>CRM forms</span></div><div><b>${data.removedScripts}</b><span>scripts removed</span></div></div><h2>Warnings</h2>${list(data.warnings)}<h2>Intentional runtime external links</h2>${list(data.external)}</body></html>`;
}
