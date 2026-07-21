"use client";

import { upload } from "@vercel/blob/client";
import { FormEvent,useMemo,useState } from "react";
import styles from "./page.module.css";

type FullResult={ok:true;downloadUrl:string;filename:string;summary:{assets:number;cssFiles:number;crmForms:number;removedScripts:number;bytes:number;warnings:string[]}};
type RepairResult={ok:true;downloadUrl:string;filename:string;summary:{assets:number;cssFiles:number;bytes:number;warnings:string[]}};
type CleanupResult={ok:true;downloadUrl:string;filename:string;summary:{beforeFiles:number;afterFiles:number;removedFiles:number;savedBytes:number;cssCandidates:number;fonts:number;bytes:number;warnings:string[]}};
type Result=FullResult|RepairResult|CleanupResult;
type Mode="export"|"repair"|"cleanup";

export default function Home() {
  const [mode,setMode]=useState<Mode>("export");
  const [url,setUrl]=useState("");const [name,setName]=useState("");const [password,setPassword]=useState("");
  const [repairUrl,setRepairUrl]=useState("");const [repairName,setRepairName]=useState("");const [indexFile,setIndexFile]=useState<File|null>(null);
  const [cleanupFile,setCleanupFile]=useState<File|null>(null);const [cleanupName,setCleanupName]=useState("");
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [result,setResult]=useState<Result|null>(null);
  const suggestedName=useMemo(()=>{try{return new URL(url).hostname.replace(/^www\./,"");}catch{return "";}},[url]);
  const repairSuggestedName=useMemo(()=>{try{return `${new URL(repairUrl).hostname.replace(/^www\./,"")}-repair`;}catch{return "";}},[repairUrl]);

  function reset(next:Mode){setMode(next);setError("");setResult(null);}
  async function submitExport(event:FormEvent){
    event.preventDefault();setBusy(true);setError("");setResult(null);
    try{const response=await fetch("/api/export",{method:"POST",headers:{"content-type":"application/json","x-exporter-password":password},body:JSON.stringify({url,name:name||suggestedName})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Export failed.");setResult(data);}
    catch(cause){setError(cause instanceof Error?cause.message:"Export failed.");}finally{setBusy(false);}
  }
  async function submitRepair(event:FormEvent){
    event.preventDefault();if(!indexFile){setError("Choose the index.html file from the earlier export.");return;}setBusy(true);setError("");setResult(null);
    try{const body=new FormData();body.set("index",indexFile);body.set("sourceUrl",repairUrl);body.set("name",repairName||repairSuggestedName);const response=await fetch("/api/repair",{method:"POST",headers:{"x-exporter-password":password},body});const data=await response.json();if(!response.ok)throw new Error(data.error||"Repair failed.");setResult(data);}
    catch(cause){setError(cause instanceof Error?cause.message:"Repair failed.");}finally{setBusy(false);}
  }
  async function submitCleanup(event:FormEvent){
    event.preventDefault();if(!cleanupFile){setError("Choose the ZIP file from the earlier export.");return;}setBusy(true);setError("");setResult(null);
    try{
      const packageName=cleanupName||cleanupFile.name.replace(/\.zip$/i,"");let response:Response;
      if(cleanupFile.size<=4_000_000){const body=new FormData();body.set("archive",cleanupFile);body.set("name",packageName);response=await fetch("/api/cleanup",{method:"POST",headers:{"x-exporter-password":password},body});}
      else{const blob=await upload(`cleanup-inputs/${Date.now()}-${cleanupFile.name}`,cleanupFile,{access:"public",handleUploadUrl:"/api/cleanup/upload",clientPayload:JSON.stringify({password})});response=await fetch("/api/cleanup",{method:"POST",headers:{"content-type":"application/json","x-exporter-password":password},body:JSON.stringify({blobUrl:blob.url,name:packageName})});}
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Cleanup failed.");setResult(data);
    }catch(cause){setError(cause instanceof Error?cause.message:"Cleanup failed.");}finally{setBusy(false);}
  }

  const isRepair=mode==="repair";const isCleanup=mode==="cleanup";
  return <main className={styles.shell}>
    <header className={styles.header}><div className={styles.brandMark}>W</div><div><p className={styles.eyebrow}>TEAM UTILITY</p><h1>WP Static Exporter</h1><p className={styles.subtitle}>Create, repair, or safely clean standalone WordPress exports without wasting earlier downloads.</p></div></header>
    <nav className={styles.tabs} aria-label="Exporter mode"><button type="button" className={mode==="export"?styles.activeTab:""} onClick={()=>reset("export")} disabled={busy}>New full export</button><button type="button" className={isRepair?styles.activeTab:""} onClick={()=>reset("repair")} disabled={busy}>Repair existing export</button><button type="button" className={isCleanup?styles.activeTab:""} onClick={()=>reset("cleanup")} disabled={busy}>Clean existing export</button></nav>
    <section className={styles.workspace}>
      {mode==="export"?<form className={styles.card} onSubmit={submitExport}>
        <div className={styles.step}><span>1</span> Source</div>
        <label>WordPress page URL<input type="url" placeholder="https://example.co.kr/" value={url} onChange={(event)=>setUrl(event.target.value)} required disabled={busy}/></label>
        <label>Output folder name<input type="text" placeholder={suggestedName||"example.co.kr"} value={name} onChange={(event)=>setName(event.target.value)} disabled={busy} maxLength={80}/></label>
        <div className={styles.step}><span>2</span> Access</div>
        <label>Team access password<input type="password" placeholder="Enter team password" value={password} onChange={(event)=>setPassword(event.target.value)} required disabled={busy} autoComplete="current-password"/></label>
        <button className={styles.primary} disabled={busy}>{busy?<><i className={styles.spinner}/>Exporting — please keep this tab open</>:"Export static site"}</button><p className={styles.note}>Most landing pages take 30–120 seconds.</p>
      </form>:isRepair?<form className={styles.card} onSubmit={submitRepair}>
        <div className={styles.step}><span>1</span> Earlier export</div>
        <label>Existing index.html<input className={styles.fileInput} type="file" accept=".html,text/html" onChange={(event)=>setIndexFile(event.target.files?.[0]||null)} required disabled={busy}/></label>
        <label>Original website URL<input type="url" placeholder="https://example.co.kr/" value={repairUrl} onChange={(event)=>setRepairUrl(event.target.value)} required disabled={busy}/></label>
        <label>Patch name<input type="text" placeholder={repairSuggestedName||"example.co.kr-repair"} value={repairName} onChange={(event)=>setRepairName(event.target.value)} disabled={busy} maxLength={80}/></label>
        <div className={styles.step}><span>2</span> Access</div>
        <label>Team access password<input type="password" placeholder="Enter team password" value={password} onChange={(event)=>setPassword(event.target.value)} required disabled={busy} autoComplete="current-password"/></label>
        <button className={styles.primary} disabled={busy}>{busy?<><i className={styles.spinner}/>Repairing — downloading only missing files</>:"Create repair patch"}</button><p className={styles.note}>The patch ZIP contains a replacement index.html and only newly needed assets.</p>
      </form>:<form className={styles.card} onSubmit={submitCleanup}>
        <div className={styles.step}><span>1</span> Earlier export</div>
        <label>Existing export ZIP<input className={styles.fileInput} type="file" accept=".zip,application/zip,application/x-zip-compressed" onChange={(event)=>setCleanupFile(event.target.files?.[0]||null)} required disabled={busy}/></label>
        <label>Cleaned package name<input type="text" placeholder={cleanupFile?.name.replace(/\.zip$/i,"")||"example-cleaned"} value={cleanupName} onChange={(event)=>setCleanupName(event.target.value)} disabled={busy} maxLength={80}/></label>
        <div className={styles.step}><span>2</span> Access</div>
        <label>Team access password<input type="password" placeholder="Enter team password" value={password} onChange={(event)=>setPassword(event.target.value)} required disabled={busy} autoComplete="current-password"/></label>
        <button className={styles.primary} disabled={busy}>{busy?<><i className={styles.spinner}/>Cleaning — keeping layout-safe files</>:"Clean and package export"}</button><p className={styles.note}>Your original ZIP stays unchanged. ZIP files up to 100 MB are supported with Blob storage.</p>
      </form>}
      <aside className={styles.card}><div className={styles.step}><span>3</span>{isRepair?" Repair patch":isCleanup?" Cleaned package":" Package"}</div>
        {!result&&!error&&<div className={styles.empty}><div className={styles.packageIcon}>ZIP</div><h2>{isRepair?"Your small repair patch will appear here":isCleanup?"Your cleaned ZIP will appear here":"Your package will appear here"}</h2><p>{isRepair?"Merge its assets folder into the old one, then replace the old index.html.":isCleanup?"It includes the cleaned site plus HTML and JSON reports listing every removal and warning.":"It will contain one readable index file, a localized assets folder, and an export report."}</p></div>}
        {error&&<div className={styles.error}><strong>{isRepair?"Repair stopped":isCleanup?"Cleanup stopped":"Export stopped"}</strong><p>{error}</p></div>}
        {result&&<div className={styles.success}><div className={styles.check}>✓</div><h2>{result.filename}</h2><p>{isRepair?"The incremental repair patch is ready.":isCleanup?"The cleaned package and audit reports are ready.":"The static package is ready."}</p><div className={styles.stats}>{"removedFiles" in result.summary?<><div><strong>{result.summary.removedFiles}</strong><span>files removed</span></div><div><strong>{(result.summary.savedBytes/1_000_000).toFixed(1)} MB</strong><span>space saved</span></div><div><strong>{result.summary.cssCandidates}</strong><span>CSS warnings</span></div><div><strong>{result.summary.fonts}</strong><span>SCDream fonts</span></div></>:<><div><strong>{result.summary.assets}</strong><span>{isRepair?"new assets":"assets"}</span></div><div><strong>{result.summary.cssFiles}</strong><span>CSS files</span></div>{"crmForms" in result.summary&&<div><strong>{result.summary.crmForms}</strong><span>CRM forms</span></div>}<div><strong>{(result.summary.bytes/1_000_000).toFixed(1)} MB</strong><span>ZIP size</span></div></>}</div>{result.summary.warnings.length>0&&<details><summary>{result.summary.warnings.length} warning(s)</summary><ul>{result.summary.warnings.map((warning)=><li key={warning}>{warning}</li>)}</ul></details>}<a className={styles.download} href={result.downloadUrl}>Download ZIP</a></div>}
      </aside>
    </section>
    <section className={styles.features}><article><b>01</b><h3>Full exports</h3><p>Capture desktop, tablet, and mobile into one standalone package.</p></article><article><b>02</b><h3>Incremental repairs</h3><p>Update old HTML and download only newly discovered dependencies.</p></article><article><b>03</b><h3>Safe cleanup</h3><p>Reuse old downloads, standardize SCDream, and retain uncertain CSS for review.</p></article><article><b>04</b><h3>Strict audit</h3><p>Every cleanup includes readable removal details and explicit warnings.</p></article></section>
  </main>;
}
