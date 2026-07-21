import { del,put } from "@vercel/blob";
import { timingSafeEqual } from "node:crypto";
import { NextRequest,NextResponse } from "next/server";
import { cleanupZipPackage } from "@/lib/cleanup-package";

export const runtime="nodejs";
export const maxDuration=300;

function validPassword(provided:string) {const expected=process.env.EXPORTER_PASSWORD;if(!expected)throw new Error("Server setup is incomplete: EXPORTER_PASSWORD is missing.");const a=Buffer.from(provided);const b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}
function safeBlobUrl(value:string) {const url=new URL(value);if(url.protocol!=="https:"||!url.hostname.endsWith(".public.blob.vercel-storage.com")||!url.pathname.includes("/cleanup-inputs/"))throw new Error("Invalid cleanup upload URL.");return url;}

export async function POST(request:NextRequest) {
  let sourceBlob:URL|undefined;
  try {
    if(!validPassword(request.headers.get("x-exporter-password")||""))return NextResponse.json({error:"Incorrect team access password."},{status:401});
    let input:Buffer;let name="";const contentType=request.headers.get("content-type")||"";
    if(contentType.includes("application/json")) {
      const body=await request.json();if(typeof body.blobUrl!=="string")return NextResponse.json({error:"A completed cleanup upload is required."},{status:400});
      sourceBlob=safeBlobUrl(body.blobUrl);name=typeof body.name==="string"?body.name:"";const response=await fetch(sourceBlob,{cache:"no-store"});if(!response.ok)throw new Error(`Unable to read uploaded ZIP (HTTP ${response.status}).`);input=Buffer.from(await response.arrayBuffer());
    } else {
      const form=await request.formData();const file=form.get("archive");const suppliedName=form.get("name");if(!(file instanceof File)||!file.name.toLowerCase().endsWith(".zip"))return NextResponse.json({error:"Choose the ZIP file from an earlier export."},{status:400});
      if(file.size>4_000_000)return NextResponse.json({error:"This ZIP requires large-file upload. Please retry; the browser will use Blob storage."},{status:413});input=Buffer.from(await file.arrayBuffer());name=typeof suppliedName==="string"?suppliedName:file.name;
    }
    const result=await cleanupZipPackage(input,name);
    let downloadUrl:string;
    if(process.env.BLOB_READ_WRITE_TOKEN){const blob=await put(`cleanups/${Date.now()}-${result.filename}`,result.zip,{access:"public",addRandomSuffix:true,contentType:"application/zip"});downloadUrl=blob.downloadUrl;}
    else {if(result.zip.length>4_000_000)throw new Error("The cleaned ZIP is larger than the local direct-download limit. Connect Vercel Blob for large cleanups.");downloadUrl=`data:application/zip;base64,${result.zip.toString("base64")}`;}
    return NextResponse.json({ok:true,downloadUrl,filename:result.filename,summary:result.summary});
  } catch(cause) {
    console.error(cause);const message=cause instanceof Error?cause.message:"Cleanup failed unexpectedly.";return NextResponse.json({error:message},{status:/password|required|choose|zip|upload|invalid|safety|limit/i.test(message)?400:500});
  } finally {if(sourceBlob&&process.env.BLOB_READ_WRITE_TOKEN)await del(sourceBlob.href).catch((cause)=>console.error("Unable to delete temporary cleanup upload",cause));}
}
