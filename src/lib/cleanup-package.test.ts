import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { cleanupZipPackage } from "./cleanup-package";

async function zipOf(files:Record<string,string>) {const zip=new JSZip();for(const [path,body] of Object.entries(files))zip.file(path,body);return zip.generateAsync({type:"nodebuffer"});}

test("turns an earlier export ZIP into a downloadable cleaned package",async()=>{
  const input=await zipOf({"old-export/index.html":'<html><head><link rel="stylesheet" href="assets/fonts.css"></head><body><img src="assets/used.png"></body></html>',"old-export/assets/fonts.css":"@font-face{font-family:Roboto;src:url(roboto.woff2)}","old-export/assets/roboto.woff2":"font","old-export/assets/used.png":"used","old-export/assets/orphan.png":"orphan"});
  const result=await cleanupZipPackage(input,"team-site.zip");const output=await JSZip.loadAsync(result.zip);
  assert.equal(result.filename,"team-site-cleaned.zip");assert(output.file("index.html"));assert(output.file("assets/used.png"));assert(!output.file("assets/orphan.png"));assert(!output.file("assets/roboto.woff2"));assert(output.file("assets/SCDream9.woff2"));assert(output.file("cleanup-report.html"));assert(output.file("cleanup-report.json"));assert.equal(result.summary.removedFiles,3);
  assert(result.summary.savedBytes>=0);
});

test("rejects invalid and missing-index ZIP uploads",async()=>{
  await assert.rejects(cleanupZipPackage(Buffer.from("not zip")),/valid ZIP/);
  await assert.rejects(cleanupZipPackage(await zipOf({"readme.txt":"hello"})),/index\.html/);
});

test("accepts safe Windows ZIP separators",async()=>{
  const input=await zipOf({"index.html":"<html><body></body></html>"});const archive=await JSZip.loadAsync(input);const entry=archive.file("index.html")!;
  Object.defineProperty(entry,"unsafeOriginalName",{value:"site\\index.html"});entry.name="site\\index.html";delete archive.files["index.html"];archive.files[entry.name]=entry;
  const result=await cleanupZipPackage(await archive.generateAsync({type:"nodebuffer"}),"windows");assert.equal(result.filename,"windows-cleaned.zip");
});
