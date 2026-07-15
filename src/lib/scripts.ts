const GOOGLE_TRACKING_PATTERN=/(?:googletagmanager\.com|google-analytics\.com|googleadservices\.com|doubleclick\.net|googlesyndication\.com|google\.com\/(?:pagead|ads|conversion)|\bgtag\s*\(|\bdataLayer\b|google_conversion|googleads)/i;

export function stripNonGoogleScriptsFromHtml(html:string) {
  let removed=0;
  return {
    html:html.replace(/<script\b[\s\S]*?<\/script\s*>/gi,(script)=>{
      if(GOOGLE_TRACKING_PATTERN.test(script))return script;
      removed++;
      return "";
    }),
    get removed(){ return removed; },
  };
}
