export const CRM_ORIGIN="https://centralcrm.kimzahost.website/wp-json/centralcrm/v1/loader.js?token=";
export const CRM_BATCH_ORIGIN="https://centralcrm.kimzahost.website/wp-json/centralcrm/v1/loader-batch.js?tokens=";

export type SlugCrmLoader = { namespace:string; attribute:string; slug:string; src:string };

export function centralCrmLoaderUrl(tokens:string[]) {
  const unique=[...new Set(tokens)];
  return unique.length > 1 ? `${CRM_BATCH_ORIGIN}${unique.join(",")}` : unique.length ? `${CRM_ORIGIN}${unique[0]}` : "";
}

export function centralCrmPlaceholder(token:string,loanType:string) {
  const escaped=loanType.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return `<div data-crm-token="${token}" data-loantype="${escaped}"></div>`;
}

export function slugCrmLoaders(html:string):SlugCrmLoader[] {
  const loaders:SlugCrmLoader[]=[]; const seen=new Set<string>();
  for(const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    try {
      const url=new URL(match[1].replace(/&amp;/g,"&"));
      const path=url.pathname.match(/^\/wp-json\/([a-z][a-z0-9_-]*)\/v1\/loader\.js$/i);
      const namespace=path?.[1]?.toLowerCase(); const slug=url.searchParams.get("slug");
      if(!namespace || !slug || !/^[a-z0-9][a-z0-9_-]*$/i.test(slug))continue;
      if(url.protocol!=="https:" || !url.hostname.endsWith(".kimzahost.website"))continue;
      const hostPrefix=url.hostname.slice(0,-".kimzahost.website".length);
      if(hostPrefix!==namespace && namespace!==`${hostPrefix}crm`)continue;
      const key=`${namespace}\0${slug}`; if(seen.has(key))continue; seen.add(key);
      loaders.push({ namespace,attribute:`data-${namespace}-embed`,slug,src:url.href });
    } catch {/* Ignore malformed script URLs. */}
  }
  return loaders;
}

export function slugCrmSignature(html:string) {
  return [...html.matchAll(/\bdata-([a-z][a-z0-9_-]*)-embed=["']([^"']+)["']/gi)]
    .map((match)=>`${match[1].toLowerCase()}|${match[2]}`);
}
