import { readFile } from "node:fs/promises";
import { join,posix } from "node:path";
import JSZip from "jszip";
import { BUNDLED_FONT_NAMES } from "./css";
import { cleanupExport,cleanupReportHtml,type CleanupReport,type CleanupResult } from "./cleanup";

const MAX_ZIP_BYTES=100*1024*1024;
const MAX_FILES=1_000;
const MAX_FILE_BYTES=25*1024*1024;
const MAX_UNCOMPRESSED_BYTES=250*1024*1024;

export type CleanupPackage={zip:Buffer;filename:string;report:CleanupReport;summary:{beforeFiles:number;afterFiles:number;removedFiles:number;savedBytes:number;cssCandidates:number;fonts:number;bytes:number;warnings:string[]}};

export async function cleanupFileMap(files:Map<string,Buffer>):Promise<CleanupResult> {
  const fonts=new Map<string,Buffer>();for(const name of BUNDLED_FONT_NAMES)fonts.set(name,await readFile(join(process.cwd(),"bundled-fonts",name)));
  return cleanupExport(files,fonts);
}

function safeName(value:string) {
  return (value||"cleaned-export").replace(/\.zip$/i,"").replace(/[^a-z0-9._-]+/gi,"-").replace(/^-+|-+$/g,"").slice(0,80)||"cleaned-export";
}

function safeEntryName(entry:{name:string;unsafeOriginalName?:string}) {
  const original=entry.unsafeOriginalName||entry.name;
  const portable=original.replace(/\\/g,"/");
  if(portable.startsWith("/")||/^[a-z]:/i.test(portable)||portable.split("/").includes(".."))throw new Error(`Unsafe ZIP entry path: ${original}`);
  const normalized=posix.normalize(portable).replace(/^\.\//,"");
  if(!normalized||normalized==="."||normalized.startsWith("../"))throw new Error(`Unsafe ZIP entry path: ${original}`);
  return normalized;
}

function stripSharedFolder(files:Map<string,Buffer>) {
  const paths=[...files.keys()];const roots=new Set(paths.map((path)=>path.split("/",1)[0]));
  if(roots.size!==1)return files;const root=[...roots][0];if(!paths.some((path)=>path.toLowerCase()===`${root.toLowerCase()}/index.html`))return files;
  return new Map([...files].map(([path,buffer])=>[path.slice(root.length+1),buffer]));
}

export async function cleanupZipPackage(input:Buffer,requestedName=""):Promise<CleanupPackage> {
  if(!input.length||input.length>MAX_ZIP_BYTES)throw new Error("Choose a non-empty ZIP file no larger than 100 MB.");
  let archive:JSZip;try{archive=await JSZip.loadAsync(input,{checkCRC32:true});}catch(cause){throw new Error(`The uploaded file is not a valid ZIP archive: ${cause instanceof Error?cause.message:"unable to read archive"}`);}
  const entries=Object.values(archive.files).filter((entry)=>!entry.dir);
  if(!entries.length||entries.length>MAX_FILES)throw new Error(`The ZIP must contain between 1 and ${MAX_FILES} files.`);
  const files=new Map<string,Buffer>();let total=0;
  for(const entry of entries) {
    const declared=(entry as unknown as {_data?:{uncompressedSize?:number}})._data?.uncompressedSize||0;
    if(declared>MAX_FILE_BYTES||total+declared>MAX_UNCOMPRESSED_BYTES)throw new Error("The ZIP expands beyond the cleanup safety limits.");
    const path=safeEntryName(entry);const buffer=await entry.async("nodebuffer");
    if(buffer.length>MAX_FILE_BYTES){throw new Error(`ZIP entry exceeds 25 MB: ${path}`);}total+=buffer.length;
    if(total>MAX_UNCOMPRESSED_BYTES)throw new Error("The ZIP expands beyond 250 MB.");
    if(files.has(path))throw new Error(`The ZIP contains a duplicate path: ${path}`);files.set(path,buffer);
  }
  const result=await cleanupFileMap(stripSharedFolder(files));const output=new JSZip();
  for(const [path,buffer] of result.files)output.file(path,buffer);
  output.file("cleanup-report.html",cleanupReportHtml(result.report));output.file("cleanup-report.json",JSON.stringify(result.report,null,2));
  const zip=await output.generateAsync({type:"nodebuffer",compression:"DEFLATE",compressionOptions:{level:7}});
  const base=safeName(requestedName||"cleaned-export");
  return {zip,filename:`${base}-cleaned.zip`,report:result.report,summary:{beforeFiles:result.report.before.files,afterFiles:result.report.after.files,removedFiles:result.report.removedFiles.length,savedBytes:Math.max(0,result.report.before.bytes-result.report.after.bytes),cssCandidates:result.report.retainedCssCandidates.length,fonts:BUNDLED_FONT_NAMES.length,bytes:zip.length,warnings:result.report.warnings}};
}
