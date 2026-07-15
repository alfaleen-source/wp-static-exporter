export const CRM_ORIGIN="https://centralcrm.kimzahost.website/wp-json/centralcrm/v1/loader.js?token=";
export const CRM_BATCH_ORIGIN="https://centralcrm.kimzahost.website/wp-json/centralcrm/v1/loader-batch.js?tokens=";

export function centralCrmLoaderUrl(tokens:string[]) {
  const unique=[...new Set(tokens)];
  return unique.length > 1 ? `${CRM_BATCH_ORIGIN}${unique.join(",")}` : unique.length ? `${CRM_ORIGIN}${unique[0]}` : "";
}

export function centralCrmPlaceholder(token:string,loanType:string) {
  const escaped=loanType.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return `<div data-crm-token="${token}" data-loantype="${escaped}"></div>`;
}
