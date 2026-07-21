import * as cheerio from "cheerio";
import { posix } from "node:path";
import postcss from "postcss";
import { BUNDLED_FONT_NAMES,S_CORE_FONT_FACES } from "./css";

const TEXT_EXTENSIONS=new Set([".css",".html",".htm",".js",".mjs",".json",".txt",".xml",".svg",".webmanifest"]);
const FONT_EXTENSIONS=new Set([".woff",".woff2",".ttf",".otf",".eot"]);

export type CleanupReport={
  before:{files:number;bytes:number};
  after:{files:number;bytes:number};
  removedFiles:{path:string;bytes:number;reason:string}[];
  retainedCssCandidates:{path:string;bytes:number;warning:string}[];
  removedFontFamilies:string[];
  warnings:string[];
};
export type CleanupResult={files:Map<string,Buffer>;report:CleanupReport};

function normalizePath(value:string) {
  const clean=decodeURIComponent(value.split(/[?#]/,1)[0]).replace(/\\/g,"/").replace(/^\.\//,"");
  const normalized=posix.normalize(clean).replace(/^\/+/,"");
  return normalized==="."||normalized.startsWith("../")?"":normalized;
}

function resolveReference(from:string,raw:string) {
  if(!raw||/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:|blob:)/i.test(raw))return "";
  return normalizePath(posix.join(posix.dirname(from),raw));
}

function localReferences(path:string,text:string) {
  const refs=new Set<string>();
  const add=(raw:string|undefined)=>{if(raw){const resolved=resolveReference(path,raw.trim().replace(/^['"]|['"]$/g,""));if(resolved)refs.add(resolved);}};
  const ext=posix.extname(path).toLowerCase();
  if(ext===".html"||ext===".htm") {
    const $=cheerio.load(text);
    const attributes=["href","src","poster","background","data-src","data-lazy-src","data-original","data-bg","data-background","data-background-image","data-lazy-bg"];
    $("*").each((_,element)=>{const node=$(element);for(const attribute of attributes)add(node.attr(attribute));for(const attribute of ["srcset","data-srcset"]){for(const part of (node.attr(attribute)||"").split(","))add(part.trim().split(/\s+/,1)[0]);}});
    $("style").each((_,element)=>{for(const ref of cssReferences(path,$(element).text()))refs.add(ref);});
    $("[style]").each((_,element)=>{for(const ref of cssReferences(path,$(element).attr("style")||""))refs.add(ref);});
  } else if(ext===".css"||ext===".svg") {
    for(const ref of cssReferences(path,text))refs.add(ref);
    if(ext===".svg")for(const match of text.matchAll(/(?:href|xlink:href)\s*=\s*["']([^"']+)/gi))add(match[1]);
  } else {
    for(const match of text.matchAll(/["'`]([^"'`\r\n]+\.(?:png|jpe?g|gif|webp|avif|svg|ico|css|js|woff2?|ttf|otf|eot))(?:[?#][^"'`]*)?["'`]/gi))add(match[1]);
  }
  return refs;
}

function cssReferences(path:string,css:string) {
  const refs=new Set<string>();
  for(const match of css.matchAll(/url\(\s*(?:["']([^"']+)["']|([^)'"\s][^)]*?))\s*\)/gi)) {
    const resolved=resolveReference(path,(match[1]||match[2]||"").trim());if(resolved)refs.add(resolved);
  }
  for(const match of css.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?/gi)) {
    const resolved=resolveReference(path,match[1]);if(resolved)refs.add(resolved);
  }
  return refs;
}

function tolerantStripFontFaces(css:string) {
  const ranges:{start:number;end:number;body:string}[]=[];let cursor=0;
  while(cursor<css.length) {
    const match=/@font-face\b/gi;match.lastIndex=cursor;const found=match.exec(css);if(!found)break;
    let index=match.lastIndex,quote="",comment=false,open=-1,depth=0;
    for(;index<css.length;index++) {
      const char=css[index],next=css[index+1];
      if(comment){if(char==="*"&&next==="/"){comment=false;index++;}continue;}
      if(quote){if(char==="\\"){index++;continue;}if(char===quote)quote="";continue;}
      if(char==="/"&&next==="*"){comment=true;index++;continue;}if(char==='"'||char==="'"){quote=char;continue;}
      if(char==="{"){if(open<0)open=index;depth++;continue;}if(char==="}"&&open>=0&&--depth===0){ranges.push({start:found.index,end:index+1,body:css.slice(open+1,index)});cursor=index+1;break;}
    }
    if(open<0||depth>0)cursor=match.lastIndex;
  }
  const families=new Set<string>();for(const range of ranges){const family=range.body.match(/(?:^|[;{])\s*font-family\s*:\s*([^;}]+)/i)?.[1];if(family)families.add(family.replace(/["']/g,"").trim());}
  let output=css;for(const range of ranges.reverse())output=output.slice(0,range.start)+output.slice(range.end);
  return {css:output,families,removed:ranges.length,fontOnly:ranges.length>0&&!output.replace(/\/\*[\s\S]*?\*\//g,"").replace(/@(?:charset|layer)\s+[^;]+;/gi,"").trim()};
}

function stripFontFaces(css:string) {
  try {
    const root=postcss.parse(css);const families=new Set<string>();let removed=0;
    root.walkAtRules(/^font-face$/i,(rule)=>{rule.walkDecls(/^font-family$/i,(decl)=>{families.add(decl.value.replace(/["']/g,"").trim());});rule.remove();removed++;});
    return {css:root.toString(),families,removed,fontOnly:removed>0&&!root.nodes.some((node)=>node.type!=="comment"&&!(node.type==="atrule"&&/^(?:charset|layer)$/i.test(node.name)&&!node.nodes)),parseWarning:false};
  } catch {
    return {...tolerantStripFontFaces(css),parseWarning:true};
  }
}

function sumBytes(files:Map<string,Buffer>){return [...files.values()].reduce((total,file)=>total+file.length,0);}

export function cleanupExport(input:Map<string,Buffer>,canonicalFonts:Map<string,Buffer>):CleanupResult {
  const files=new Map<string,Buffer>();
  for(const [rawPath,buffer] of input){const path=normalizePath(rawPath);if(path)files.set(path,Buffer.from(buffer));}
  if(![...files.keys()].some((path)=>/^(?:.*\/)?index\.html$/i.test(path)))throw new Error("The input folder must contain an index.html file.");
  const originalSizes=new Map([...files].map(([path,buffer])=>[path,buffer.length]));
  const before={files:files.size,bytes:sumBytes(files)};const removedFiles:CleanupReport["removedFiles"]=[];const removedFontFamilies=new Set<string>();const fontOnlyCss=new Set<string>();const malformedCss=new Set<string>();

  for(const [path,buffer] of [...files]) {
    const ext=posix.extname(path).toLowerCase();if(ext!==".css")continue;
    const stripped=stripFontFaces(buffer.toString("utf8"));
    if(stripped.parseWarning)malformedCss.add(path);
    for(const family of stripped.families)removedFontFamilies.add(family);
    if(stripped.removed)files.set(path,Buffer.from(stripped.css));
    if(stripped.fontOnly)fontOnlyCss.add(path);
  }
  for(const [path,buffer] of [...files]) {
    if(!/\.html?$/i.test(path))continue;const $=cheerio.load(buffer.toString("utf8"));
    $("style").each((index,element)=>{const node=$(element);const stripped=stripFontFaces(node.text());if(stripped.parseWarning)malformedCss.add(`${path} (inline style ${index+1})`);for(const family of stripped.families)removedFontFamilies.add(family);if(stripped.fontOnly)node.remove();else if(stripped.removed)node.text(stripped.css);});
    $("link[rel~='stylesheet'][href]").each((_,element)=>{const node=$(element);const target=resolveReference(path,node.attr("href")||"");if(fontOnlyCss.has(target))node.remove();});
    if(!$("link[href='assets/static-overrides.css']").length)$("head").append('\n<link rel="stylesheet" href="assets/static-overrides.css" data-static-exporter="responsive-safeguards">\n');
    files.set(path,Buffer.from($.html()));
  }

  for(const path of fontOnlyCss){const file=files.get(path);if(file){removedFiles.push({path,bytes:originalSizes.get(path)??file.length,reason:"font-only stylesheet replaced by canonical SCDream"});files.delete(path);}}
  for(const name of BUNDLED_FONT_NAMES){const source=canonicalFonts.get(name);if(!source)throw new Error(`Bundled canonical font is missing: ${name}`);files.set(`assets/${name}`,Buffer.from(source));}
  const overridesPath="assets/static-overrides.css";const existing=files.get(overridesPath)?.toString("utf8")||"";
  const withoutOldCanonical=existing.replace(/\/\* Canonical bundled S-Core Dream font family\. \*\/[\s\S]*?(?=\/\* Static-export responsive safeguards\.|$)/,"the-placeholder");
  const cleanedExisting=withoutOldCanonical.replace("the-placeholder","").trimStart();
  files.set(overridesPath,Buffer.from(`/* Canonical bundled S-Core Dream font family. */\n${S_CORE_FONT_FACES}\n\n${cleanedExisting}`));
  for(const [path,buffer] of [...files])if(FONT_EXTENSIONS.has(posix.extname(path).toLowerCase())&&!BUNDLED_FONT_NAMES.includes(posix.basename(path))){removedFiles.push({path,bytes:buffer.length,reason:"non-canonical web font"});files.delete(path);}

  const roots=[...files.keys()].filter((path)=>!path.startsWith("assets/")||/\.html?$/i.test(path));
  const reachable=new Set<string>();const queue=[...roots];
  while(queue.length){const path=queue.shift()!;if(reachable.has(path)||!files.has(path))continue;reachable.add(path);const ext=posix.extname(path).toLowerCase();if(!TEXT_EXTENSIONS.has(ext))continue;for(const ref of localReferences(path,files.get(path)!.toString("utf8")))if(files.has(ref)&&!reachable.has(ref))queue.push(ref);}
  const retainedCssCandidates:CleanupReport["retainedCssCandidates"]=[];
  for(const [path,buffer] of files)if(path.startsWith("assets/")&&posix.extname(path).toLowerCase()===".css"&&!reachable.has(path)){retainedCssCandidates.push({path,bytes:buffer.length,warning:"Not referenced by the current HTML graph; retained because deleting CSS can change layout."});queue.push(path);}
  while(queue.length){const path=queue.shift()!;if(reachable.has(path)||!files.has(path))continue;reachable.add(path);if(TEXT_EXTENSIONS.has(posix.extname(path).toLowerCase()))for(const ref of localReferences(path,files.get(path)!.toString("utf8")))if(files.has(ref)&&!reachable.has(ref))queue.push(ref);}
  for(const [path,buffer] of [...files])if(path.startsWith("assets/")&&!reachable.has(path)){removedFiles.push({path,bytes:buffer.length,reason:"not referenced by HTML, retained CSS, or another reachable asset"});files.delete(path);}
  removedFiles.sort((a,b)=>a.path.localeCompare(b.path));retainedCssCandidates.sort((a,b)=>a.path.localeCompare(b.path));
  const warnings=[
    "Font cleanup intentionally removes every web-font family except the bundled SCDream/S-Core files. Visually verify icon glyphs if the source used an icon font.",
    ...[...malformedCss].sort().map((path)=>`${path} contains malformed CSS. Cleanup used tolerant font removal and preserved the remaining CSS; visually verify this stylesheet.`),
    ...(retainedCssCandidates.length?[`${retainedCssCandidates.length} unreferenced CSS candidate(s) were retained. Review cleanup-report.html before deleting them manually.`]:[]),
  ];
  return {files,report:{before,after:{files:files.size,bytes:sumBytes(files)},removedFiles,retainedCssCandidates,removedFontFamilies:[...removedFontFamilies].sort(),warnings}};
}

export function cleanupReportHtml(report:CleanupReport) {
  const esc=(value:string)=>value.replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));
  const rows=(items:{path:string;bytes:number;reason?:string;warning?:string}[])=>items.length?`<table><thead><tr><th>File</th><th>Size</th><th>Details</th></tr></thead><tbody>${items.map((item)=>`<tr><td><code>${esc(item.path)}</code></td><td>${(item.bytes/1024).toFixed(1)} KB</td><td>${esc(item.reason||item.warning||"")}</td></tr>`).join("")}</tbody></table>`:"<p>None.</p>";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Cleanup report</title><style>body{font:15px/1.55 Arial;max-width:1050px;margin:40px auto;padding:0 24px;color:#25283b}h1{font-size:30px}h2{margin-top:34px}.stats{display:flex;gap:12px;flex-wrap:wrap}.stats div{background:#f2f3f8;padding:15px 20px;border-radius:9px}table{border-collapse:collapse;width:100%}th,td{text-align:left;border-bottom:1px solid #ddd;padding:10px;vertical-align:top}code{word-break:break-all}.warning{background:#fff4d6;border-left:4px solid #e6a700;padding:10px 14px}</style></head><body><h1>Static export cleanup report</h1><div class="stats"><div><b>${report.before.files} → ${report.after.files}</b><br>files</div><div><b>${(report.before.bytes/1e6).toFixed(2)} → ${(report.after.bytes/1e6).toFixed(2)} MB</b><br>size</div><div><b>${((report.before.bytes-report.after.bytes)/1e6).toFixed(2)} MB</b><br>removed</div></div><h2>Warnings</h2>${report.warnings.map((warning)=>`<p class="warning">${esc(warning)}</p>`).join("")}<h2>Removed files (${report.removedFiles.length})</h2>${rows(report.removedFiles)}<h2>CSS review candidates — retained (${report.retainedCssCandidates.length})</h2>${rows(report.retainedCssCandidates)}<h2>Replaced font families</h2><p>${report.removedFontFamilies.length?report.removedFontFamilies.map(esc).join(", "):"None."}</p></body></html>`;
}
