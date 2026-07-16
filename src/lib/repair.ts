import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";
import { html as beautifyHtml } from "js-beautify";
import { request as playwrightRequest } from "playwright-core";
import { bundledSCoreFontName, normalizeFullWidthBackgroundStyle, rewriteCssAssetUrls, type CssLocation } from "./css";
import { assertDesignAssetPayload } from "./asset-validation";
import { launchBrowser,STATIC_OVERRIDES } from "./exporter";
import { assertSafePublicUrl, safeOutputName } from "./security";
import { externalDependencies, isIntentionalRuntimeExternal, removeWordPressDiscoveryMarkup, scrubExternalDependencies, stripExternalMarkupComments } from "./standalone";
import { normalizeStaticWidgets } from "./static-widgets";

const MAX_HTML_BYTES=5*1024*1024;
const MAX_ASSET_BYTES=18*1024*1024;
const MAX_TOTAL_BYTES=70*1024*1024;
const MAX_ASSETS=300;

function extensionFor(url:URL,contentType:string) {
  const pathExt=url.pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if(pathExt)return pathExt;
  return ({"text/css":"css","image/jpeg":"jpg","image/png":"png","image/gif":"gif","image/webp":"webp","image/svg+xml":"svg","image/x-icon":"ico","font/woff":"woff","font/woff2":"woff2","font/ttf":"ttf","font/otf":"otf"} as Record<string,string>)[contentType.split(";")[0].trim()]||"bin";
}

function assetName(url:URL,contentType:string) {
  const ext=extensionFor(url,contentType);
  const base=decodeURIComponent(url.pathname.split("/").pop()||"asset").replace(/\.[^.]+$/,"").replace(/[^a-z0-9_-]+/gi,"-").replace(/^-|-$/g,"").slice(0,45)||"asset";
  return `${base}-${createHash("sha1").update(url.href).digest("hex").slice(0,9)}.${ext}`;
}

export type RepairPackage={zip:Buffer;filename:string;summary:{assets:number;cssFiles:number;bytes:number;warnings:string[]}};

export async function repairExistingIndex(html:string,sourceUrl:string,requestedName=""):Promise<RepairPackage> {
  if(!html.trim()||Buffer.byteLength(html)>MAX_HTML_BYTES)throw new Error("Upload a non-empty index.html smaller than 5 MB.");
  const baseUrl=await assertSafePublicUrl(sourceUrl);
  const $=cheerio.load(html);
  removeWordPressDiscoveryMarkup($);
  const zip=new JSZip(); const assets=zip.folder("assets")!;
  let sessionCookie="";
  const browser=await launchBrowser();
  try {
    const context=await browser.newContext({viewport:{width:1440,height:900},userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36 WPStaticRepairer/1.0"});
    const page=await context.newPage();await page.goto(baseUrl.href,{waitUntil:"domcontentloaded",timeout:60000});await page.waitForLoadState("networkidle",{timeout:15000}).catch(()=>undefined);await page.waitForTimeout(1500);
    const cookies=await context.cookies();sessionCookie=cookies.map((cookie)=>`${cookie.name}=${cookie.value}`).join("; ");
  } finally { await browser.close(); }
  const requestContext=await playwrightRequest.newContext({ignoreHTTPSErrors:true,userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36 WPStaticRepairer/1.0",extraHTTPHeaders:{referer:baseUrl.origin+"/",...(sessionCookie?{cookie:sessionCookie}:{})}});
  const localized=new Map<string,string>(); const warnings:string[]=[]; let totalBytes=0; let cssFiles=0;

  async function localizeCss(css:string,url:URL,location:CssLocation) {
    return rewriteCssAssetUrls(css,url,location,localize,true);
  }
  async function localize(url:URL):Promise<string> {
    const font=bundledSCoreFontName(url);
    if(font) { if(!localized.has(`font:${font}`)){localized.set(`font:${font}`,`assets/${font}`);assets.file(font,await readFile(join(process.cwd(),"bundled-fonts",font)));} return `assets/${font}`; }
    const fragment=url.hash; const key=url.href.split("#")[0]; if(localized.has(key))return `${localized.get(key)!}${fragment}`;
    if(localized.size>=MAX_ASSETS)throw new Error(`Repair asset limit reached (${MAX_ASSETS}).`);
    const safe=await assertSafePublicUrl(key); const response=await requestContext.get(safe.href,{timeout:30000,maxRedirects:5,headers:{accept:"*/*"}});
    if(!response.ok()){const status=response.status();await response.dispose();throw new Error(`HTTP ${status}`);}
    const headers=response.headers(); const length=Number(headers["content-length"]||0); if(length>MAX_ASSET_BYTES){await response.dispose();throw new Error("asset exceeds 18 MB");}
    const buffer=await response.body(); const finalUrl=new URL(response.url()); const contentType=headers["content-type"]||"application/octet-stream"; await response.dispose();
    assertDesignAssetPayload(buffer,contentType,finalUrl);
    if(buffer.length>MAX_ASSET_BYTES||totalBytes+buffer.length>MAX_TOTAL_BYTES)throw new Error("repair package safety limit exceeded");
    const name=assetName(finalUrl,contentType); const path=`assets/${name}`; localized.set(key,path); totalBytes+=buffer.length;
    if(contentType.toLowerCase().includes("text/css")||name.endsWith(".css")){cssFiles++;assets.file(name,await localizeCss(buffer.toString("utf8"),finalUrl,"asset"));}else assets.file(name,buffer);
    return `${path}${fragment}`;
  }
  async function tryLocalize(raw:string) {
    if(!raw||/^(?:data:|blob:|#|mailto:|tel:|javascript:|assets\/)/i.test(raw))return raw;
    try{return await localize(new URL(raw,baseUrl));}catch(cause){warnings.push(`${raw} — ${cause instanceof Error?cause.message:"download failed"}`);return raw;}
  }

  for(const element of $("link[href]").toArray()){
    const node=$(element);const rel=(node.attr("rel")||"").toLowerCase();const as=(node.attr("as")||"").toLowerCase();
    if(/(?:stylesheet|icon|apple-touch-icon|mask-icon|fluid-icon)/.test(rel)||(rel.includes("preload")&&/(?:style|image|font)/.test(as))){const value=node.attr("href");if(value)node.attr("href",await tryLocalize(value));}
  }
  for(const element of $("meta[content]").toArray()){
    const node=$(element);const kind=`${node.attr("name")||""} ${node.attr("property")||""}`.toLowerCase();const value=node.attr("content");
    if(/(?:tileimage|image|icon|logo)/.test(kind)&&value&&/^https?:\/\//i.test(value))node.attr("content",await tryLocalize(value));
  }
  const refs:[string,string][]=[["img[src]","src"],["img[data-src]","data-src"],["img[data-lazy-src]","data-lazy-src"],["img[data-original]","data-original"],["source[src]","src"],["video[poster]","poster"],["audio[src]","src"],["video[src]","src"],["input[type='image'][src]","src"],["[background]","background"],["svg image[href]","href"],["svg image[xlink\\:href]","xlink:href"],["svg use[href]","href"],["svg use[xlink\\:href]","xlink:href"]];
  for(const [selector,attr] of refs)for(const element of $(selector).toArray()){const node=$(element);const value=node.attr(attr);if(value)node.attr(attr,await tryLocalize(value));}
  for(const element of $("[srcset],[data-srcset]").toArray()){
    const node=$(element);const attr=node.attr("srcset")!==undefined?"srcset":"data-srcset";const value=node.attr(attr)||"";if(/^data:/i.test(value.trim()))continue;const parts=[];
    for(const part of value.split(",")){const bits=part.trim().split(/\s+/);const url=bits.shift();if(url)parts.push(`${await tryLocalize(url)} ${bits.join(" ")}`.trim());}node.attr(attr,parts.join(", "));
  }
  for(const element of $("style").toArray()){const node=$(element);node.text(await localizeCss(node.text(),baseUrl,"html"));}
  for(const element of $("[style]").toArray()){const node=$(element);const value=node.attr("style");if(value)node.attr("style",await localizeCss(value,baseUrl,"html"));}
  for(const attr of ["data-bg","data-background","data-background-image","data-lazy-bg"])for(const element of $(`[${attr}]`).toArray()){const node=$(element);const value=node.attr(attr);if(value)node.attr(attr,/url\s*\(/i.test(value)?await localizeCss(value,baseUrl,"html"):await tryLocalize(value));}

  $('.upb_row_bg[data-bg-override="full"]').each((_,element)=>{const node=$(element);node.attr("style",normalizeFullWidthBackgroundStyle(node.attr("style")||""));});
  normalizeStaticWidgets($); removeWordPressDiscoveryMarkup($); scrubExternalDependencies($);
  $("link[data-static-exporter='responsive-safeguards']").remove();
  $("head").append('\n<link rel="stylesheet" href="assets/static-overrides.css" data-static-exporter="responsive-safeguards">\n');
  assets.file("static-overrides.css",STATIC_OVERRIDES);cssFiles++;
  let output=stripExternalMarkupComments($.html());output=beautifyHtml(output,{indent_size:2,wrap_line_length:140,max_preserve_newlines:1,end_with_newline:true,content_unformatted:["pre","textarea"]});
  const residual=externalDependencies(output).filter((value)=>!isIntentionalRuntimeExternal(value));if(residual.length)throw new Error(`Standalone repair audit failed: ${residual.slice(0,5).join(", ")}`);
  await requestContext.dispose();
  const name=safeOutputName(requestedName,`${baseUrl.hostname.replace(/^www\./,"")}-repair`);
  zip.file("index.html",output);zip.file("MERGE-INSTRUCTIONS.txt","Replace the old index.html with this file, then merge this assets folder into the existing assets folder. Keep all existing assets; overwrite static-overrides.css when prompted.\r\n");
  const buffer=await zip.generateAsync({type:"nodebuffer",compression:"DEFLATE",compressionOptions:{level:7}});
  return {zip:buffer,filename:`${name}-repair-patch.zip`,summary:{assets:localized.size+1,cssFiles,bytes:buffer.length,warnings}};
}
