export type CssLocation = "asset"|"html";

export async function rewriteCssAssetUrls(
  css:string,
  baseUrl:URL,
  location:CssLocation,
  resolve:(url:URL)=>Promise<string>,
) {
  let output=css.replace(/&(?:amp;)?quot;|&#0*34;|&#x0*22;/gi,'"');
  const localPath=(path:string)=>location === "asset" ? path.replace(/^assets\//,"") : path;
  const urlRefs=[...output.matchAll(/url\(\s*(?:(["'])(.*?)\1|([^)]*?))\s*\)/gi)];
  for(const match of urlRefs) {
    const raw=(match[2] ?? match[3] ?? "").trim().replace(/;+\s*$/,"");
    if(!raw || /^(data:|blob:|#)/i.test(raw)) continue;
    try { output=output.split(match[0]).join(`url(${localPath(await resolve(new URL(raw,baseUrl)))})`); }
    catch { /* Keep the source reference if it cannot be downloaded. */ }
  }
  const imports=[...output.matchAll(/@import\s+(["'])(.*?)\1\s*([^;]*);/gi)];
  for(const match of imports) {
    const raw=match[2].trim();
    if(!raw || /^(data:|blob:|#)/i.test(raw)) continue;
    try { output=output.split(match[0]).join(`@import url(${localPath(await resolve(new URL(raw,baseUrl)))}) ${match[3].trim()};`); }
    catch { /* Keep the source reference if it cannot be downloaded. */ }
  }
  return output;
}

export function normalizeFullWidthBackgroundStyle(input:string) {
  const style=input
    .replace(/(?:^|;)\s*(?:min-width|width|left|right|margin-left)\s*:[^;]*/gi,"")
    .replace(/^\s*;|;\s*$/g,"").trim();
  return `${style}${style && !style.endsWith(";") ? ";" : ""} min-width: 100vw; left: 50%; right: auto; margin-left: -50vw; width: 100vw;`;
}
