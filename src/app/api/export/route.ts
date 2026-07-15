import { put } from "@vercel/blob";
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { exportStaticSite } from "@/lib/exporter";

export const runtime = "nodejs";
export const maxDuration = 300;

function validPassword(provided:string) {
  const expected=process.env.EXPORTER_PASSWORD;
  if(!expected) throw new Error("Server setup is incomplete: EXPORTER_PASSWORD is missing.");
  const a=Buffer.from(provided); const b=Buffer.from(expected);
  return a.length===b.length && timingSafeEqual(a,b);
}

export async function POST(request:NextRequest) {
  try {
    if(!validPassword(request.headers.get("x-exporter-password") || "")) return NextResponse.json({error:"Incorrect team access password."},{status:401});
    const body=await request.json();
    if(typeof body.url!=="string") return NextResponse.json({error:"A WordPress page URL is required."},{status:400});
    const result=await exportStaticSite(body.url,typeof body.name==="string"?body.name:"");
    let downloadUrl:string;
    if(process.env.BLOB_READ_WRITE_TOKEN) {
      const blob=await put(`exports/${Date.now()}-${result.filename}`,result.zip,{access:"public",addRandomSuffix:true,contentType:"application/zip"});
      downloadUrl=blob.downloadUrl;
    } else {
      if(result.zip.length>4_000_000) throw new Error("This export is larger than the direct-download limit. Connect a Vercel Blob store before production use.");
      downloadUrl=`data:application/zip;base64,${result.zip.toString("base64")}`;
    }
    return NextResponse.json({ok:true,downloadUrl,filename:result.filename,summary:result.summary});
  } catch(cause) {
    console.error(cause);
    const message=cause instanceof Error?cause.message:"The export failed unexpectedly.";
    return NextResponse.json({error:message},{status:/password|URL|required|blocked|unsafe/i.test(message)?400:500});
  }
}
