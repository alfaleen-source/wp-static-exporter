import { mkdir,readFile,readdir,rm,stat,writeFile } from "node:fs/promises";
import { dirname,join,relative,resolve } from "node:path";
import { BUNDLED_FONT_NAMES } from "../src/lib/css";
import { cleanupExport,cleanupReportHtml } from "../src/lib/cleanup";

async function collect(root:string,current=root,files=new Map<string,Buffer>()) {
  for(const entry of await readdir(current,{withFileTypes:true})) {
    const full=join(current,entry.name);if(entry.isDirectory())await collect(root,full,files);else if(entry.isFile())files.set(relative(root,full).replace(/\\/g,"/"),await readFile(full));
  }
  return files;
}

async function main() {
  const input=resolve(process.argv[2]||"");const output=resolve(process.argv[3]||`${input}-cleaned`);
  if(!process.argv[2])throw new Error("Usage: npm run cleanup -- <input-folder> [output-folder]");
  if(!(await stat(input).catch(()=>undefined))?.isDirectory())throw new Error(`Input folder does not exist: ${input}`);
  if(await stat(output).catch(()=>undefined))throw new Error(`Output already exists; choose a new folder so the original remains untouched: ${output}`);
  const fonts=new Map<string,Buffer>();for(const name of BUNDLED_FONT_NAMES)fonts.set(name,await readFile(join(process.cwd(),"bundled-fonts",name)));
  const result=cleanupExport(await collect(input),fonts);await mkdir(output,{recursive:true});
  try {
    for(const [path,buffer] of result.files){const destination=join(output,...path.split("/"));await mkdir(dirname(destination),{recursive:true});await writeFile(destination,buffer);}
    await writeFile(join(output,"cleanup-report.json"),JSON.stringify(result.report,null,2));await writeFile(join(output,"cleanup-report.html"),cleanupReportHtml(result.report));
  } catch(cause){await rm(output,{recursive:true,force:true});throw cause;}
  const saved=result.report.before.bytes-result.report.after.bytes;
  console.log(`Cleaned copy created: ${output}`);console.log(`Files: ${result.report.before.files} -> ${result.report.after.files}`);console.log(`Saved: ${(saved/1e6).toFixed(2)} MB`);console.log(`CSS candidates retained for review: ${result.report.retainedCssCandidates.length}`);console.log(`Audit: ${join(output,"cleanup-report.html")}`);
}

main().catch((cause)=>{console.error(cause instanceof Error?cause.message:cause);process.exitCode=1;});
