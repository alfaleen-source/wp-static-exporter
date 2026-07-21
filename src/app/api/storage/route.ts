import { del,list,type ListBlobResultBlob } from "@vercel/blob";
import { timingSafeEqual } from "node:crypto";
import { NextRequest,NextResponse } from "next/server";
import { assertManagedDeletion,managedBlobKind,MANAGED_BLOB_PREFIXES } from "@/lib/storage";

export const runtime="nodejs";

function validPassword(provided:string) {const expected=process.env.EXPORTER_PASSWORD;if(!expected)throw new Error("Server setup is incomplete: EXPORTER_PASSWORD is missing.");const a=Buffer.from(provided);const b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}

async function managedBlobs() {
  if(!process.env.BLOB_READ_WRITE_TOKEN&&!process.env.BLOB_STORE_ID)throw new Error("Vercel Blob is not connected to this deployment.");
  const groups=await Promise.all(MANAGED_BLOB_PREFIXES.map(async(prefix)=>{const blobs:ListBlobResultBlob[]=[];let cursor:string|undefined;
    do{const page=await list({prefix,limit:1000,cursor});blobs.push(...page.blobs);cursor=page.hasMore?page.cursor:undefined;if(page.hasMore&&!cursor)throw new Error("Blob listing stopped because pagination did not return a cursor.");}while(cursor);
    return blobs;
  }));
  return groups.flat().sort((a,b)=>b.uploadedAt.getTime()-a.uploadedAt.getTime());
}

function publicBlob(blob:ListBlobResultBlob) {return {pathname:blob.pathname,size:blob.size,uploadedAt:blob.uploadedAt.toISOString(),downloadUrl:blob.downloadUrl,kind:managedBlobKind(blob.pathname)!};}

export async function POST(request:NextRequest) {
  try {
    if(!validPassword(request.headers.get("x-exporter-password")||""))return NextResponse.json({error:"Incorrect team access password."},{status:401});
    const body=await request.json();const blobs=await managedBlobs();
    if(body.action==="list")return NextResponse.json({ok:true,files:blobs.map(publicBlob),summary:{files:blobs.length,bytes:blobs.reduce((total,blob)=>total+blob.size,0)}});
    if(body.action==="delete"){
      const pathnames=assertManagedDeletion(body.pathnames,new Set(blobs.map((blob)=>blob.pathname)));const selected=new Set(pathnames);const deleting=blobs.filter((blob)=>selected.has(blob.pathname));await del(pathnames);
      return NextResponse.json({ok:true,deleted:{files:deleting.length,bytes:deleting.reduce((total,blob)=>total+blob.size,0),pathnames}});
    }
    return NextResponse.json({error:"Choose a valid storage action."},{status:400});
  } catch(cause){console.error(cause);const message=cause instanceof Error?cause.message:"Storage operation failed unexpectedly.";return NextResponse.json({error:message},{status:/password|select|refused|duplicate|stale|valid|not connected/i.test(message)?400:500});}
}
