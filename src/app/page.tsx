"use client";

import { upload } from "@vercel/blob/client";
import { FormEvent,useMemo,useState } from "react";
import styles from "./page.module.css";

type FullResult={ok:true;downloadUrl:string;filename:string;summary:{assets:number;cssFiles:number;crmForms:number;removedScripts:number;bytes:number;warnings:string[]}};
type RepairResult={ok:true;downloadUrl:string;filename:string;summary:{assets:number;cssFiles:number;bytes:number;warnings:string[]}};
type CleanupResult={ok:true;downloadUrl:string;filename:string;summary:{beforeFiles:number;afterFiles:number;removedFiles:number;savedBytes:number;cssCandidates:number;fonts:number;bytes:number;warnings:string[]}};
type Result=FullResult|RepairResult|CleanupResult;
type StorageFile={pathname:string;size:number;uploadedAt:string;downloadUrl:string;kind:string};
type Mode="export"|"repair"|"cleanup"|"storage";

export default function Home() {
  const [mode,setMode]=useState<Mode>("export");
  const [url,setUrl]=useState("");const [name,setName]=useState("");const [password,setPassword]=useState("");
  const [repairUrl,setRepairUrl]=useState("");const [repairName,setRepairName]=useState("");const [indexFile,setIndexFile]=useState<File|null>(null);
  const [cleanupFile,setCleanupFile]=useState<File|null>(null);const [cleanupName,setCleanupName]=useState("");
  const [storageFiles,setStorageFiles]=useState<StorageFile[]>([]);const [selectedFiles,setSelectedFiles]=useState<string[]>([]);const [storageLoaded,setStorageLoaded]=useState(false);
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
  async function loadStorage(){
    setBusy(true);setError("");setResult(null);
    try{const response=await fetch("/api/storage",{method:"POST",headers:{"content-type":"application/json","x-exporter-password":password},body:JSON.stringify({action:"list"})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Unable to load stored files.");setStorageFiles(data.files);setSelectedFiles([]);setStorageLoaded(true);}
    catch(cause){setError(cause instanceof Error?cause.message:"Unable to load stored files.");}finally{setBusy(false);}
  }
  async function deleteStorage(){
    if(!selectedFiles.length)return;const selectedBytes=storageFiles.filter((file)=>selectedFiles.includes(file.pathname)).reduce((total,file)=>total+file.size,0);
    if(!window.confirm(`Permanently delete ${selectedFiles.length} stored file(s) using ${(selectedBytes/1_000_000).toFixed(1)} MB? This cannot be undone.`))return;
    setBusy(true);setError("");
    try{const response=await fetch("/api/storage",{method:"POST",headers:{"content-type":"application/json","x-exporter-password":password},body:JSON.stringify({action:"delete",pathnames:selectedFiles})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Unable to delete stored files.");const deleted=new Set(data.deleted.pathnames as string[]);setStorageFiles((files)=>files.filter((file)=>!deleted.has(file.pathname)));setSelectedFiles([]);}
    catch(cause){setError(cause instanceof Error?cause.message:"Unable to delete stored files.");}finally{setBusy(false);}
  }

  const isRepair=mode==="repair";const isCleanup=mode==="cleanup";const isStorage=mode==="storage";const storageBytes=storageFiles.reduce((total,file)=>total+file.size,0);
  return <main className={styles.shell}>
    <header className={styles.header}><div className={styles.brandMark}>W</div><div><p className={styles.eyebrow}>TEAM UTILITY</p><h1>WP Static Exporter</h1><p className={styles.subtitle}>Create, repair, or safely clean standalone WordPress exports without wasting earlier downloads.</p></div></header>
    <nav className={styles.tabs} aria-label="Exporter mode"><button type="button" className={mode==="export"?styles.activeTab:""} onClick={()=>reset("export")} disabled={busy}>New full export</button><button type="button" className={isRepair?styles.activeTab:""} onClick={()=>reset("repair")} disabled={busy}>Repair existing export</button><button type="button" className={isCleanup?styles.activeTab:""} onClick={()=>reset("cleanup")} disabled={busy}>Clean existing export</button><button type="button" className={isStorage?styles.activeTab:""} onClick={()=>reset("storage")} disabled={busy}>Manage storage</button></nav>
    <section className={styles.workspace}>
      {isStorage?<><section className={styles.card}>
        <div className={styles.step}><span>1</span> Storage access</div>
        <p className={styles.storageIntro}>Review only the ZIP files created by this exporter. Other files in the connected Blob store are excluded.</p>
        <label>Team access password<input type="password" placeholder="Enter team password" value={password} onChange={(event)=>setPassword(event.target.value)} required disabled={busy} autoComplete="current-password"/></label>
        <button type="button" className={styles.primary} onClick={loadStorage} disabled={busy||!password}>{busy?<><i className={styles.spinner}/>Loading stored files</>:storageLoaded?"Refresh stored files":"Show stored files"}</button>
        {error&&<div className={styles.error}><strong>Storage operation stopped</strong><p>{error}</p></div>}
        {storageLoaded&&<div className={styles.storageSummary}><div><strong>{storageFiles.length}</strong><span>stored files</span></div><div><strong>{(storageBytes/1_000_000).toFixed(1)} MB</strong><span>managed storage</span></div></div>}
      </section><aside className={styles.card}>
        <div className={styles.step}><span>2</span> Select files to delete</div>
        {!storageLoaded?<div className={styles.empty}><div className={styles.packageIcon}>GB</div><h2>Load your stored exports</h2><p>Enter the team password, then review files before deleting anything.</p></div>:storageFiles.length===0?<div className={styles.empty}><div className={styles.check}>✓</div><h2>No managed files stored</h2><p>The exporter folders in Vercel Blob are empty.</p></div>:<><div className={styles.storageActions}><label><input className={styles.selectBox} type="checkbox" checked={selectedFiles.length===storageFiles.length} onChange={(event)=>setSelectedFiles(event.target.checked?storageFiles.map((file)=>file.pathname):[])} disabled={busy}/> Select all</label><span>{selectedFiles.length} selected</span></div><div className={styles.storageList}>{storageFiles.map((file)=><label className={styles.storageRow} key={file.pathname}><input className={styles.selectBox} type="checkbox" checked={selectedFiles.includes(file.pathname)} onChange={(event)=>setSelectedFiles((selected)=>event.target.checked?[...selected,file.pathname]:selected.filter((pathname)=>pathname!==file.pathname))} disabled={busy}/><span><b>{file.pathname.split("/").pop()}</b><small>{file.kind} · {(file.size/1_000_000).toFixed(2)} MB · {file.uploadedAt.slice(0,16).replace("T"," ")} UTC</small></span><a href={file.downloadUrl} target="_blank" rel="noreferrer">Download</a></label>)}</div><button type="button" className={styles.danger} onClick={deleteStorage} disabled={busy||!selectedFiles.length}>{busy?"Deleting selected files…":`Delete selected (${selectedFiles.length})`}</button></>}
      </aside></>:<>{mode==="export"?<form className={styles.card} onSubmit={submitExport}>
        <div className={styles.step}><span>1</span> Source</div>
        <label>WordPress page URL<input type="url" placeholder="https://example.co.kr/ or http://localhost:8080/" value={url} onChange={(event)=>setUrl(event.target.value)} required disabled={busy}/></label>
        <label>Output folder name<input type="text" placeholder={suggestedName||"example.co.kr"} value={name} onChange={(event)=>setName(event.target.value)} disabled={busy} maxLength={80}/></label>
        <div className={styles.step}><span>2</span> Access</div>
        <label>Team access password<input type="password" placeholder="Enter team password" value={password} onChange={(event)=>setPassword(event.target.value)} required disabled={busy} autoComplete="current-password"/></label>
        <button className={styles.primary} disabled={busy}>{busy?<><i className={styles.spinner}/>Exporting — please keep this tab open</>:"Export static site"}</button><p className={styles.note}>Most landing pages take 30–120 seconds. Native local runs can capture localhost when enabled in .env.local.</p>
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
      </>}
    </section>
    <section className={styles.features}><article><b>01</b><h3>Full exports</h3><p>Capture desktop, tablet, and mobile into one standalone package.</p></article><article><b>02</b><h3>Incremental repairs</h3><p>Update old HTML and download only newly discovered dependencies.</p></article><article><b>03</b><h3>Safe cleanup</h3><p>Reuse old downloads, standardize SCDream, and retain uncertain CSS for review.</p></article><article><b>04</b><h3>Strict audit</h3><p>Every cleanup includes readable removal details and explicit warnings.</p></article></section>
  </main>;
}
