"use client";

import { FormEvent, useMemo, useState } from "react";
import styles from "./page.module.css";

type ExportResult = { ok: true; downloadUrl: string; filename: string; summary: { assets: number; cssFiles: number; crmForms: number; removedScripts: number; bytes: number; warnings: string[] } };

export default function Home() {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ExportResult | null>(null);
  const suggestedName = useMemo(() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } }, [url]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/export", { method: "POST", headers: { "content-type": "application/json", "x-exporter-password": password }, body: JSON.stringify({ url, name: name || suggestedName }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Export failed.");
      setResult(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Export failed."); }
    finally { setBusy(false); }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brandMark}>W</div>
        <div><p className={styles.eyebrow}>TEAM UTILITY</p><h1>WP Static Exporter</h1><p className={styles.subtitle}>Turn a WordPress landing page into an organized, editable static package.</p></div>
      </header>
      <section className={styles.workspace}>
        <form className={styles.card} onSubmit={submit}>
          <div className={styles.step}><span>1</span> Source</div>
          <label>WordPress page URL<input type="url" placeholder="https://example.co.kr/" value={url} onChange={(e) => setUrl(e.target.value)} required disabled={busy} /></label>
          <label>Output folder name<input type="text" placeholder={suggestedName || "example.co.kr"} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} maxLength={80} /></label>
          <div className={styles.step}><span>2</span> Access</div>
          <label>Team access password<input type="password" placeholder="Enter team password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={busy} autoComplete="current-password" /></label>
          <button className={styles.primary} disabled={busy}>{busy ? <><i className={styles.spinner} /> Exporting — please keep this tab open</> : "Export static site"}</button>
          <p className={styles.note}>Most landing pages take 30–120 seconds.</p>
        </form>
        <aside className={styles.card}>
          <div className={styles.step}><span>3</span> Package</div>
          {!result && !error && <div className={styles.empty}><div className={styles.packageIcon}>ZIP</div><h2>Your package will appear here</h2><p>It will contain one readable index file, a localized assets folder, and an export report.</p></div>}
          {error && <div className={styles.error}><strong>Export stopped</strong><p>{error}</p></div>}
          {result && <div className={styles.success}>
            <div className={styles.check}>✓</div><h2>{result.filename}</h2><p>The static package is ready.</p>
            <div className={styles.stats}><div><strong>{result.summary.assets}</strong><span>assets</span></div><div><strong>{result.summary.cssFiles}</strong><span>CSS files</span></div><div><strong>{result.summary.crmForms}</strong><span>CRM forms</span></div><div><strong>{(result.summary.bytes / 1_000_000).toFixed(1)} MB</strong><span>ZIP size</span></div></div>
            {result.summary.warnings.length > 0 && <details><summary>{result.summary.warnings.length} warning(s)</summary><ul>{result.summary.warnings.map((w) => <li key={w}>{w}</li>)}</ul></details>}
            <a className={styles.download} href={result.downloadUrl}>Download ZIP</a>
          </div>}
        </aside>
      </section>
      <section className={styles.features}>
        <article><b>01</b><h3>Rendered first</h3><p>Chromium captures lazy-loaded and generated page content.</p></article>
        <article><b>02</b><h3>Assets localized</h3><p>Images, fonts, CSS, icons, and background files move into assets.</p></article>
        <article><b>03</b><h3>Code organized</h3><p>Scripts are cleaned, CRM is restored, and major sections are labeled.</p></article>
        <article><b>04</b><h3>Audited</h3><p>The report lists downloads, retained links, and anything needing review.</p></article>
      </section>
    </main>
  );
}
