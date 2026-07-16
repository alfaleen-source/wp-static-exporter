import { put } from "@vercel/blob";
import { timingSafeEqual } from "node:crypto";
import { NextRequest,NextResponse } from "next/server";
import { repairExistingIndex } from "@/lib/repair";

export const runtime="nodejs";
export const maxDuration=300;

function validPassword(provided:string) {
  const expected=process.env.EXPORTER_PASSWORD;
  if(!expected)throw new Error("Server setup is incomplete: EXPORTER_PASSWORD is missing.");
  const a=Buffer.from(provided);const b=Buffer.from(expected);
  return a.length===b.length&&timingSafeEqual(a,b);
}

export async function POST(request:NextRequest) {
  try {
    if(!validPassword(request.headers.get("x-exporter-password")||""))return NextResponse.json({error:"Incorrect team access password."},{status:401});
    const form=await request.formData();const file=form.get("index");const sourceUrl=form.get("sourceUrl");const name=form.get("name");
    if(!(file instanceof File)||file.name.toLowerCase()!=="index.html")return NextResponse.json({error:"Choose the index.html file from the earlier export."},{status:400});
    if(typeof sourceUrl!=="string"||!sourceUrl.trim())return NextResponse.json({error:"The original website URL is required to resolve its remaining files."},{status:400});
    const result=await repairExistingIndex(await file.text(),sourceUrl,typeof name==="string"?name:"");
    let downloadUrl:string;
    if(process.env.BLOB_READ_WRITE_TOKEN){const blob=await put(`repairs/${Date.now()}-${result.filename}`,result.zip,{access:"public",addRandomSuffix:true,contentType:"application/zip"});downloadUrl=blob.downloadUrl;}
    else {if(result.zip.length>4_000_000)throw new Error("This repair patch is larger than the direct-download limit. Connect Vercel Blob before production use.");downloadUrl=`data:application/zip;base64,${result.zip.toString("base64")}`;}
    return NextResponse.json({ok:true,downloadUrl,filename:result.filename,summary:result.summary});
  } catch(cause) {
    console.error(cause);const message=cause instanceof Error?cause.message:"Repair failed unexpectedly.";
    return NextResponse.json({error:message},{status:/password|URL|required|upload|index\.html|blocked|unsafe/i.test(message)?400:500});
  }
}
