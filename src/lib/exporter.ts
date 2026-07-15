import chromium from "@sparticuz/chromium";
import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import type { AnyNode } from "domhandler";
import { existsSync } from "node:fs";
import JSZip from "jszip";
import { html as beautifyHtml } from "js-beautify";
import { chromium as playwright, request as playwrightRequest, type Browser, type Page } from "playwright-core";
import { assertSafePublicUrl, safeOutputName } from "./security";

const MAX_ASSET_BYTES = 18 * 1024 * 1024;
const MAX_TOTAL_BYTES = 90 * 1024 * 1024;
const MAX_ASSETS = 450;
const CRM_ORIGIN = "https://centralcrm.kimzahost.website/wp-json/centralcrm/v1/loader.js?token=";

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

async function launchBrowser(): Promise<Browser> {
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
  } finally { await browser?.close(); }

  const $ = cheerio.load(renderedHtml);
  let removedScripts = 0;
  const crmTokens = new Map<string,string>();

  $("[data-crm-token]").each((_, element) => {
    const wrapper = $(element); const token = wrapper.attr("data-crm-token");
    if (!token || !/^[a-f0-9]{40}$/i.test(token)) return;
    const loanType = wrapper.attr("data-loantype") || wrapper.find('input[name="loan_type"]').attr("value") || "상담신청";
    crmTokens.set(token, loanType);
    wrapper.replaceWith(`<div id="crm-form-${token}" data-loantype="${loanType.replace(/"/g,"&quot;")}"></div>`);
  });
  $("script").each((_,element)=>{ const node=$(element); if(!isGoogleTrackingScript(node)) { node.remove(); removedScripts++; } });
  $("noscript").each((_,element)=>{ const node=$(element); if(!/(?:googletagmanager|google-analytics|googleadservices|doubleclick|googleads)/i.test(node.html() || "")) node.remove(); });
  $('link[rel="preload"][as="script"],link[rel="modulepreload"],link[rel="EditURI"],link[rel="wlwmanifest"],meta[name="generator"]').remove();
  $("*").each((_, element) => { for (const attr of Object.keys((element as unknown as { attribs?:Record<string,string> }).attribs || {})) if (/^on/i.test(attr)) $(element).removeAttr(attr); });
  $(".elementor-invisible").removeClass("elementor-invisible");

  const zip = new JSZip();
  const assetsFolder = zip.folder("assets")!;
  const requestContext = await playwrightRequest.newContext({ ignoreHTTPSErrors:true, userAgent:"Mozilla/5.0 WPStaticExporter/1.0" });
  const localized = new Map<string,string>();
  const failed = new Set<string>();
  let totalBytes = 0;
  let cssFiles = 0;

  async function localizeCss(css: string, cssUrl: URL): Promise<string> {
    const refs = [...css.matchAll(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi)];
    let output = css;
    for (const match of refs) {
      const raw = match[2]; if (/^(data:|blob:|#)/i.test(raw)) continue;
      try { const path = await localize(new URL(raw, cssUrl)); output = output.split(raw).join(path.replace(/^assets\//, "")); } catch { /* warning recorded by localize */ }
    }
    return output;
  }

  async function localize(url: URL): Promise<string> {
    const key = url.href.split("#")[0];
    if (localized.has(key)) return localized.get(key)!;
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
    const name = assetName(finalAssetUrl, contentType);
    const path = `assets/${name}`;
    localized.set(key, path); totalBytes += buffer.length;
    if (contentType.toLowerCase().includes("text/css") || name.endsWith(".css")) { cssFiles++; assetsFolder.file(name, await localizeCss(buffer.toString("utf8"), finalAssetUrl)); }
    else assetsFolder.file(name, buffer);
    return path;
  }

  async function tryLocalize(raw: string, base = finalUrl) {
    if (!raw || /^(data:|blob:|#|mailto:|tel:|javascript:)/i.test(raw)) return raw;
    try { return await localize(new URL(raw, base)); }
    catch (cause) { const label = `${raw} — ${cause instanceof Error ? cause.message : "download failed"}`; if (!failed.has(label)) { failed.add(label); warnings.push(label); } return raw; }
  }

  for (const element of $("link[rel~='stylesheet']").toArray()) { const node=$(element); const href=node.attr("href"); if(href) node.attr("href",await tryLocalize(href)); }
  for (const selector of ["img[src]","source[src]","video[poster]","audio[src]","video[src]","input[type='image'][src]","link[rel~='icon'][href]"]) {
    for (const element of $(selector).toArray()) { const node=$(element); const attr=node.attr("src")!==undefined?"src":node.attr("poster")!==undefined?"poster":"href"; const value=node.attr(attr); if(value) node.attr(attr,await tryLocalize(value)); }
  }
  for (const element of $("[srcset]").toArray()) {
    const node=$(element); const srcset=node.attr("srcset") || ""; const parts=[];
    for (const part of srcset.split(",")) { const bits=part.trim().split(/\s+/); const url=bits.shift(); if(url) parts.push(`${await tryLocalize(url)} ${bits.join(" ")}`.trim()); }
    node.attr("srcset",parts.join(", "));
  }
  for (const element of $("style").toArray()) { const node=$(element); node.text(await localizeCss(node.text(),finalUrl)); }
  for (const element of $("[style]").toArray()) { const node=$(element); const style=node.attr("style"); if(style) node.attr("style",await localizeCss(style,finalUrl)); }

  $("body").prepend("\n<!-- ========== PAGE START ========== -->\n");
  $("header").first().before("\n<!-- ========== SITE HEADER ========== -->\n");
  const main=$("main").first(); if(main.length) main.before("\n<!-- ========== MAIN CONTENT ========== -->\n"); else $("#content").first().before("\n<!-- ========== MAIN CONTENT ========== -->\n");
  $("section").each((_,element)=>{ const node=$(element); const label=node.attr("aria-label")||node.attr("id")||node.attr("class")?.split(/\s+/).slice(0,2).join(" "); if(label) node.before(`\n<!-- ========== SECTION: ${label} ========== -->\n`); });
  $("footer").first().before("\n<!-- ========== SITE FOOTER ========== -->\n");
  $("[id^='crm-form-']").each((_,element)=>{ const node=$(element); node.before(`\n<!-- ========== CENTRAL CRM FORM: ${node.attr("data-loantype") || "상담신청"} ========== -->\n`); });
  if (crmTokens.size) { $("body").append("\n<!-- ========== CENTRAL CRM LOADERS ========== -->\n" + [...crmTokens.keys()].map((token)=>`<script src="${CRM_ORIGIN}${token}" async></script>`).join("\n") + "\n"); }

  let output = $.html();
  output = beautifyHtml(output, { indent_size:2, wrap_line_length:140, max_preserve_newlines:1, end_with_newline:true, content_unformatted:["pre","textarea"] });
  const name = safeOutputName(requestedName, finalUrl.hostname.replace(/^www\./,""));
  const external = [...new Set([...output.matchAll(/(?:href|src)="(https?:\/\/[^"#]+)"/gi)].map((match)=>match[1]).filter((url)=>!url.startsWith(CRM_ORIGIN)))];
  const report = buildReport({ source:initialUrl.href, final:finalUrl.href, name, assets:localized.size, cssFiles, crmForms:$("[id^='crm-form-']").length, removedScripts, warnings, external });
  zip.file("index.html",output); zip.file("export-report.html",report);
  const zipBuffer = await zip.generateAsync({ type:"nodebuffer", compression:"DEFLATE", compressionOptions:{ level:7 } });
  await requestContext.dispose();
  const filename=`${name}.zip`;
  return { zip:zipBuffer, filename, report, summary:{ assets:localized.size, cssFiles, crmForms:$("[id^='crm-form-']").length, removedScripts, bytes:zipBuffer.length, warnings } };
}

function buildReport(data:{source:string;final:string;name:string;assets:number;cssFiles:number;crmForms:number;removedScripts:number;warnings:string[];external:string[]}) {
  const esc=(v:string)=>v.replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
  const list=(items:string[])=>items.length?`<ul>${items.map((x)=>`<li>${esc(x)}</li>`).join("")}</ul>`:"<p>None</p>";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Export report — ${esc(data.name)}</title><style>body{font:15px/1.6 Arial;max-width:900px;margin:50px auto;padding:0 24px;color:#25283b}h1{font-size:30px}h2{margin-top:32px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.grid div{padding:18px;background:#f3f3f9;border-radius:10px}.grid b,.grid span{display:block}.grid b{font-size:22px}code{word-break:break-all}@media(max-width:650px){.grid{grid-template-columns:1fr 1fr}}</style></head><body><h1>Static export report</h1><p><b>Source:</b> <code>${esc(data.source)}</code><br><b>Captured:</b> <code>${esc(data.final)}</code><br><b>Generated:</b> ${new Date().toISOString()}</p><div class="grid"><div><b>${data.assets}</b><span>assets</span></div><div><b>${data.cssFiles}</b><span>CSS files</span></div><div><b>${data.crmForms}</b><span>CRM forms</span></div><div><b>${data.removedScripts}</b><span>scripts removed</span></div></div><h2>Warnings</h2>${list(data.warnings)}<h2>Retained external links</h2>${list(data.external)}</body></html>`;
}
