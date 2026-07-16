import type { CheerioAPI } from "cheerio";

const RUNTIME_EXTERNAL=/(?:googletagmanager\.com|google-analytics\.com|googleadservices\.com|doubleclick\.net|googlesyndication\.com|google\.com\/(?:pagead|ads|conversion)|centralcrm\.kimzahost\.website)/i;
const EXTERNAL=/^https?:\/\//i;
const DOCUMENT_NAMESPACE=/^https?:\/\/www\.w3\.org\/(?:2000\/svg|1999\/xlink|1999\/xhtml)\/?$/i;

export function isIntentionalRuntimeExternal(value:string) {
  return EXTERNAL.test(value) && RUNTIME_EXTERNAL.test(value);
}

function isDocumentNamespace(value:string) {
  return DOCUMENT_NAMESPACE.test(value.trim());
}

export function removeWordPressDiscoveryMarkup($:CheerioAPI) {
  let removed=0;
  $("link").each((_,element)=>{
    const node=$(element);
    const rel=(node.attr("rel") || "").toLowerCase();
    const type=(node.attr("type") || "").toLowerCase();
    const href=(node.attr("href") || "").toLowerCase();
    const discovery=/(?:^|\s)(?:canonical|shortlink|pingback|edituri|wlwmanifest)(?:\s|$)/.test(rel)
      || rel === "https://api.w.org/"
      || /(?:rss|atom|oembed)/.test(type)
      || /\/(?:feed|comments\/feed|wp-json|xmlrpc\.php)(?:[/?#]|$)/.test(href);
    if(discovery) { node.remove(); removed++; }
  });
  $("meta[name='generator']").remove();
  return removed;
}

export function scrubExternalDependencies($:CheerioAPI) {
  let removed=0;
  for(const attr of ["href","src","poster","data","action","background","content","xlink:href","data-src","data-lazy-src","data-original","data-bg","data-background","data-background-image","data-lazy-bg"]) {
    $(`[${attr.replace(":","\\:")}]`).each((_,element)=>{
      const node=$(element);
      const value=(node.attr(attr) || "").trim();
      if(!EXTERNAL.test(value) || isIntentionalRuntimeExternal(value) || isDocumentNamespace(value))return;
      const tag=(element as unknown as { tagName?:string }).tagName?.toLowerCase() || "";
      if(["link","iframe","frame","object","embed"].includes(tag))node.remove();
      else node.removeAttr(attr);
      removed++;
    });
  }
  for(const attr of ["srcset","data-srcset"]) {
    $(`[${attr}]`).each((_,element)=>{
      const node=$(element);
      const value=node.attr(attr) || "";
      if(!/https?:\/\//i.test(value))return;
      const kept=value.split(",").map((part)=>part.trim()).filter((part)=>!EXTERNAL.test(part));
      if(kept.length)node.attr(attr,kept.join(", ")); else node.removeAttr(attr);
      removed++;
    });
  }
  $("*").each((_,element)=>{
    const node=$(element);
    for(const [attr,value] of Object.entries((element as unknown as { attribs?:Record<string,string> }).attribs || {})) {
      if(!/^https?:\/\//i.test(value.trim()) || isIntentionalRuntimeExternal(value.trim()) || isDocumentNamespace(value))continue;
      node.removeAttr(attr); removed++;
    }
  });
  return removed;
}

export function externalDependencies(html:string) {
  const found=new Set<string>();
  const patterns=[
    /[\w:-]+=["'](https?:\/\/[^"']+)/gi,
    /url\(\s*["']?(https?:\/\/[^)'"\s]+)/gi,
    /@import\s+(?:url\()?\s*["']?(https?:\/\/[^)'"\s;]+)/gi,
  ];
  for(const pattern of patterns)for(const match of html.matchAll(pattern))found.add(match[1].replace(/&amp;/g,"&"));
  return [...found].filter((value)=>!isDocumentNamespace(value));
}

export function stripExternalMarkupComments(html:string) {
  return html.replace(/<!--[\s\S]*?-->/g,(comment)=>{
    const dependencies=externalDependencies(comment);
    return dependencies.some((value)=>!isIntentionalRuntimeExternal(value)) ? "" : comment;
  });
}
