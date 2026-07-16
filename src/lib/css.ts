export type CssLocation = "asset"|"html";
export const BUNDLED_FONT_NAMES=Array.from({length:9},(_,index)=>`SCDream${index+1}.woff2`);
export const S_CORE_FONT_FACES=BUNDLED_FONT_NAMES.map((name,index)=>`@font-face {
  font-family: 'S-Core${index+1}';
  src: url('${name}') format('woff2');
  font-weight: ${index < 4 ? "normal" : "bold"};
  font-style: normal;
  font-display: swap;
}`).join("\n");

export function bundledSCoreFontName(url:URL) {
  const filename=decodeURIComponent(url.pathname.split("/").pop() || "");
  const match=filename.match(/^scdream([1-9])(?:[^/]*)\.woff2$/i);
  return match ? `SCDream${match[1]}.woff2` : undefined;
}

export async function rewriteCssAssetUrls(
  css:string,
  baseUrl:URL,
  location:CssLocation,
  resolve:(url:URL)=>Promise<string>,
  stripUnresolved=false,
) {
  let output=css.replace(/&(?:amp;)?quot;|&#0*34;|&#x0*22;/gi,'"');
  const localPath=(path:string)=>location === "asset" ? path.replace(/^assets\//,"") : path;
  const urlRefs=[...output.matchAll(/url\(\s*(?:(["'])(.*?)\1|([^)]*?))\s*\)/gi)];
  for(const match of urlRefs) {
    const raw=(match[2] ?? match[3] ?? "").trim().replace(/;+\s*$/,"");
    if(!raw || /^(data:|blob:|#)/i.test(raw)) continue;
    try { output=output.split(match[0]).join(`url(${localPath(await resolve(new URL(raw,baseUrl)))})`); }
    catch { if(stripUnresolved) output=output.split(match[0]).join('url("")'); }
  }
  const imports=[...output.matchAll(/@import\s+(["'])(.*?)\1\s*([^;]*);/gi)];
  for(const match of imports) {
    const raw=match[2].trim();
    if(!raw || /^(data:|blob:|#)/i.test(raw)) continue;
    try { output=output.split(match[0]).join(`@import url(${localPath(await resolve(new URL(raw,baseUrl)))}) ${match[3].trim()};`); }
    catch { if(stripUnresolved) output=output.split(match[0]).join(""); }
  }
  return output;
}

export function normalizeFullWidthBackgroundStyle(input:string) {
  const style=input
    .replace(/(?:^|;)\s*(?:min-width|width|left|right|margin-left)\s*:[^;]*/gi,"")
    .replace(/^\s*;|;\s*$/g,"").trim();
  return `${style}${style && !style.endsWith(";") ? ";" : ""} min-width: 100vw; left: 50%; right: auto; margin-left: -50vw; width: 100vw;`;
}

export function stripInlineStyleProperties(input:string,properties:string[]) {
  if(!input)return "";
  const names=properties.map((name)=>name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");
  return input
    .replace(new RegExp(`(?:^|;)\\s*(?:${names})\\s*:[^;]*`,"gi"),"")
    .replace(/^\s*;|;\s*$/g,"").trim();
}

export function formatStaticCounter(value:string,thousandsSeparator=",",decimalSeparator=".") {
  const normalized=value.trim().replace(/,/g,"");
  const match=normalized.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if(!match)return value;
  const grouped=thousandsSeparator ? match[2].replace(/\B(?=(\d{3})+(?!\d))/g,thousandsSeparator) : match[2];
  return `${match[1]}${grouped}${match[3] ? decimalSeparator+match[3] : ""}`;
}
