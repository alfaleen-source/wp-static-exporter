export function assertDesignAssetPayload(buffer:Buffer,contentType:string,url:URL) {
  const sample=buffer.subarray(0,Math.min(buffer.length,1024)).toString("utf8").trimStart().toLowerCase();
  const html=sample.startsWith("<html")||sample.startsWith("<!doctype html")||sample.includes("<script")&&sample.includes("cupid");
  if(html||/^text\/html\b/i.test(contentType))throw new Error(`asset server returned an HTML challenge instead of ${url.pathname.split("/").pop()||"the requested file"}`);
}
