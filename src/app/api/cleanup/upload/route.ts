import { handleUpload,type HandleUploadBody } from "@vercel/blob/client";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime="nodejs";

function validPassword(provided:string) {const expected=process.env.EXPORTER_PASSWORD;if(!expected)throw new Error("Server setup is incomplete: EXPORTER_PASSWORD is missing.");const a=Buffer.from(provided);const b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}

export async function POST(request:Request) {
  try {
    const body=await request.json() as HandleUploadBody;
    const response=await handleUpload({body,request,onBeforeGenerateToken:async(pathname,clientPayload)=>{
      let password="";try{const parsed=JSON.parse(clientPayload||"{}");if(typeof parsed.password==="string")password=parsed.password;}catch{/* rejected below */}
      if(!validPassword(password))throw new Error("Incorrect team access password.");if(!pathname.startsWith("cleanup-inputs/")||!pathname.toLowerCase().endsWith(".zip"))throw new Error("Only cleanup ZIP uploads are allowed.");
      return {allowedContentTypes:["application/zip","application/x-zip-compressed"],maximumSizeInBytes:100*1024*1024,addRandomSuffix:true,tokenPayload:"cleanup-input"};
    },onUploadCompleted:async()=>{}});
    return NextResponse.json(response);
  } catch(cause){const message=cause instanceof Error?cause.message:"Unable to authorize cleanup upload.";return NextResponse.json({error:message},{status:400});}
}
