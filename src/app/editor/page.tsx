"use client";
/* eslint-disable react-hooks/immutability -- The editor intentionally mutates DOM nodes inside a sandboxed iframe. */

import JSZip from "jszip";
import Link from "next/link";
import { ChangeEvent, MouseEvent as ReactMouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { findIndexFile, relativeZipReference, resolveZipReference, safeUploadName } from "@/lib/editor-archive";
import styles from "./editor.module.css";

type Viewport = "mobile" | "desktop";
type Selected = { element: HTMLElement; label: string } | null;

const TEXT_SELECTOR = "h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,small,label,a,button";
const IMAGE_SELECTOR = "img";
const EDITOR_STYLE_ID = "xtractor-editor-style";

function icon(name: "upload" | "undo" | "phone" | "desktop" | "download" | "text" | "image" | "trash") {
  const paths = {
    upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 15v5h16v-5"/></>,
    undo: <><path d="M9 7H4v-5"/><path d="M4 7c3-4 10-5 14-1 4 4 2 11-3 14"/></>,
    phone: <rect x="7" y="2" width="10" height="20" rx="2"/>,
    desktop: <><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></>,
    download: <><path d="M12 3v12m0 0 5-5m-5 5-5-5"/><path d="M4 19v2h16v-2"/></>,
    text: <><path d="M4 5h16M12 5v14M8 19h8"/></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m5 18 5-5 3 3 2-2 4 4"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7"/><path d="M10 11v6m4-6v6"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function mimeFor(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", avif: "image/avif", woff: "font/woff", woff2: "font/woff2" } as Record<string, string>)[extension ?? ""] ?? "application/octet-stream";
}

export default function EditorPage() {
  const [archive, setArchive] = useState<JSZip | null>(null);
  const [indexPath, setIndexPath] = useState("");
  const [originalHtml, setOriginalHtml] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [fileName, setFileName] = useState("");
  const [selected, setSelected] = useState<Selected>(null);
  const [viewport, setViewport] = useState<Viewport>("mobile");
  const [history, setHistory] = useState<string[]>([]);
  const [status, setStatus] = useState("ZIP 파일을 업로드해 시작하세요");
  const [busy, setBusy] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<string[]>([]);

  const remember = useCallback(() => {
    const body = iframeRef.current?.contentDocument?.body;
    if (body) setHistory((items) => [...items.slice(-19), body.innerHTML]);
  }, []);

  const preparePreview = useCallback(async (zip: JSZip, html: string, entry: string) => {
    objectUrls.current.forEach(URL.revokeObjectURL);
    objectUrls.current = [];
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script").forEach((node) => node.remove());

    async function blobUrl(path: string) {
      const item = zip.file(path);
      if (!item) return null;
      const url = URL.createObjectURL(new Blob([await item.async("arraybuffer")], { type: mimeFor(path) }));
      objectUrls.current.push(url);
      return url;
    }

    for (const link of Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]'))) {
      const href = link.getAttribute("href") ?? "";
      const cssPath = resolveZipReference(entry, href);
      const cssFile = cssPath ? zip.file(cssPath) : null;
      if (!cssFile || !cssPath) continue;
      let css = await cssFile.async("text");
      const matches = [...css.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)];
      for (const match of matches) {
        const assetPath = resolveZipReference(cssPath, match[2]);
        const url = assetPath ? await blobUrl(assetPath) : null;
        if (url) css = css.replace(match[0], `url("${url}")`);
      }
      const style = doc.createElement("style");
      style.textContent = css;
      link.replaceWith(style);
    }

    for (const image of Array.from(doc.querySelectorAll<HTMLImageElement>("img[src]"))) {
      const source = image.getAttribute("src") ?? "";
      const path = resolveZipReference(entry, source);
      const url = path ? await blobUrl(path) : null;
      if (url) {
        image.dataset.exportSrc = source;
        image.src = url;
      }
      image.removeAttribute("srcset");
    }
    return `<!doctype html>\n${doc.documentElement.outerHTML}`;
  }, []);

  async function loadZip(file: File) {
    if (!file.name.toLowerCase().endsWith(".zip")) return setStatus("ZIP 파일만 업로드할 수 있습니다");
    if (file.size > 100 * 1024 * 1024) return setStatus("ZIP 파일은 100MB 이하로 업로드해 주세요");
    setBusy(true);
    setStatus("사이트를 안전하게 불러오는 중입니다...");
    try {
      const zip = await JSZip.loadAsync(file, { checkCRC32: true });
      const paths = Object.keys(zip.files);
      if (paths.length > 5000) throw new Error("파일 수가 5,000개를 초과합니다");
      const entry = findIndexFile(paths);
      if (!entry) throw new Error("index.html 파일을 찾을 수 없습니다");
      const html = await zip.file(entry)!.async("text");
      const preview = await preparePreview(zip, html, entry);
      setArchive(zip);
      setIndexPath(entry);
      setOriginalHtml(html);
      setPreviewHtml(preview);
      setFileName(file.name.replace(/\.zip$/i, ""));
      setSelected(null);
      setHistory([]);
      setStatus(`${file.name} 준비 완료`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "ZIP 파일을 열 수 없습니다");
    } finally {
      setBusy(false);
    }
  }

  function activateEditor() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || !archive) return;
    doc.getElementById(EDITOR_STYLE_ID)?.remove();
    const style = doc.createElement("style");
    style.id = EDITOR_STYLE_ID;
    style.textContent = `[data-x-editable]{cursor:text}[data-x-editable]:hover,[data-x-image]:hover{outline:2px dashed #7c5cff;outline-offset:3px}[data-x-selected]{outline:3px solid #7c5cff!important;outline-offset:3px}`;
    doc.head.append(style);
    doc.querySelectorAll<HTMLElement>(TEXT_SELECTOR).forEach((element) => {
      if (!element.closest("script,style,svg") && element.children.length === 0) {
        element.contentEditable = "true";
        element.dataset.xEditable = "true";
        element.spellcheck = true;
        element.addEventListener("input", () => setStatus("수정 사항이 저장 대기 중입니다"));
      }
    });
    doc.querySelectorAll<HTMLElement>(IMAGE_SELECTOR).forEach((element) => { element.dataset.xImage = "true"; });
    doc.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const target = (event.target as HTMLElement).closest<HTMLElement>(`${TEXT_SELECTOR},${IMAGE_SELECTOR},section,article,div`);
      if (!target || target === doc.body || target === doc.documentElement) return;
      doc.querySelectorAll("[data-x-selected]").forEach((node) => node.removeAttribute("data-x-selected"));
      target.dataset.xSelected = "true";
      const label = target.tagName === "IMG" ? "이미지" : `${target.tagName.toLowerCase()} 요소`;
      setSelected({ element: target, label });
    }, true);
  }

  function addText(tag: "h2" | "p") {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    remember();
    const element = doc.createElement(tag);
    element.textContent = tag === "h2" ? "새로운 제목을 입력하세요" : "새로운 내용을 입력하세요.";
    element.contentEditable = "true";
    element.dataset.xEditable = "true";
    const container = selected?.element.closest("section,article,main,div") ?? doc.body;
    container.append(element);
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.focus();
    setSelected({ element, label: `${tag} 요소` });
    setStatus("새 텍스트를 추가했습니다");
  }

  function removeSelected() {
    if (!selected || !window.confirm("선택한 요소를 삭제할까요? 실행 취소로 복원할 수 있습니다.")) return;
    remember();
    selected.element.remove();
    setSelected(null);
    setStatus("요소를 삭제했습니다");
  }

  function undo() {
    const body = iframeRef.current?.contentDocument?.body;
    const previous = history.at(-1);
    if (!body || !previous) return;
    body.innerHTML = previous;
    setHistory((items) => items.slice(0, -1));
    setSelected(null);
    activateEditor();
    setStatus("마지막 작업을 취소했습니다");
  }

  async function addOrReplaceImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const doc = iframeRef.current?.contentDocument;
    if (!file || !doc || !archive || !indexPath) return;
    remember();
    const storedPath = `${indexPath.includes("/") ? indexPath.slice(0, indexPath.lastIndexOf("/") + 1) : ""}assets/editor-uploads/${safeUploadName(file.name)}`;
    const bytes = await file.arrayBuffer();
    archive.file(storedPath, bytes);
    const url = URL.createObjectURL(new Blob([bytes], { type: file.type || mimeFor(storedPath) }));
    objectUrls.current.push(url);
    const image = selected?.element.tagName === "IMG" ? selected.element as HTMLImageElement : doc.createElement("img");
    image.src = url;
    image.dataset.exportSrc = relativeZipReference(indexPath, storedPath);
    image.alt ||= "업로드 이미지";
    image.dataset.xImage = "true";
    if (!image.isConnected) (selected?.element.closest("section,article,main,div") ?? doc.body).append(image);
    setSelected({ element: image, label: "이미지" });
    setStatus("이미지를 적용했습니다");
    event.target.value = "";
  }

  async function exportZip() {
    const currentDoc = iframeRef.current?.contentDocument;
    if (!archive || !currentDoc || !originalHtml) return;
    setBusy(true);
    setStatus("편집된 ZIP 파일을 만드는 중입니다...");
    try {
      const exportDoc = new DOMParser().parseFromString(originalHtml, "text/html");
      const body = currentDoc.body.cloneNode(true) as HTMLBodyElement;
      body.querySelectorAll<HTMLElement>("[data-export-src]").forEach((element) => {
        element.setAttribute("src", element.dataset.exportSrc ?? "");
      });
      body.querySelectorAll<HTMLElement>("*").forEach((element) => {
        element.removeAttribute("contenteditable");
        element.removeAttribute("spellcheck");
        [...element.attributes].filter((attribute) => attribute.name.startsWith("data-x-") || attribute.name === "data-export-src").forEach((attribute) => element.removeAttribute(attribute.name));
      });
      exportDoc.body.innerHTML = body.innerHTML;
      archive.file(indexPath, `<!doctype html>\n${exportDoc.documentElement.outerHTML}`);
      const blob = await archive.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${fileName || "edited-site"}-edited.zip`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("편집된 사이트를 다운로드했습니다");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "ZIP 파일을 만들 수 없습니다");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => () => objectUrls.current.forEach(URL.revokeObjectURL), []);

  const preventDrop = (event: ReactMouseEvent) => event.preventDefault();

  return (
    <main className={styles.app}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="Xtractor 홈"><span className={styles.mark}>X</span><span>Xtractor <b>Content Studio</b></span></Link>
        <div className={styles.headerActions}>
          <span className={styles.privacy}>브라우저 안에서만 처리됩니다</span>
          <button className={styles.exportButton} onClick={exportZip} disabled={!archive || busy}>{icon("download")} 편집 ZIP 저장</button>
        </div>
      </header>

      {!archive ? (
        <section className={styles.welcome}>
          <div className={styles.intro}><span className={styles.eyebrow}>NO-CODE CONTENT EDITOR</span><h1>디자인은 그대로,<br/><em>한국어 콘텐츠만 쉽게.</em></h1><p>완성된 독립형 사이트 ZIP을 올리고 텍스트와 이미지를 직접 편집한 뒤 새 ZIP으로 저장하세요.</p></div>
          <button className={styles.dropzone} onClick={() => zipInputRef.current?.click()} onDragOver={preventDrop} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) loadZip(file); }} disabled={busy}>
            <span className={styles.uploadIcon}>{icon("upload")}</span><strong>{busy ? "사이트를 불러오는 중..." : "사이트 ZIP 업로드"}</strong><small>클릭하거나 ZIP 파일을 여기에 놓으세요 · 최대 100MB</small>
          </button>
          <div className={styles.promiseGrid}><div><b>01</b><strong>디자인 보존</strong><span>기존 HTML과 CSS 구조를 유지합니다.</span></div><div><b>02</b><strong>안전한 삭제</strong><span>확인 단계와 실행 취소를 제공합니다.</span></div><div><b>03</b><strong>비공개 처리</strong><span>파일을 서버에 업로드하지 않습니다.</span></div></div>
        </section>
      ) : (
        <div className={styles.workspace}>
          <aside className={styles.sidebar}>
            <div className={styles.fileCard}><span className={styles.fileBadge}>ZIP</span><div><strong>{fileName}</strong><small>{indexPath}</small></div><button onClick={() => zipInputRef.current?.click()}>교체</button></div>
            <section className={styles.toolSection}><div className={styles.sectionTitle}><span>추가하기</span><small>선택 영역 아래에 배치</small></div><button className={styles.toolButton} onClick={() => addText("h2")}>{icon("text")}<span><b>제목 추가</b><small>새로운 섹션 제목</small></span></button><button className={styles.toolButton} onClick={() => addText("p")}>{icon("text")}<span><b>문단 추가</b><small>설명 또는 안내 문구</small></span></button><button className={styles.toolButton} onClick={() => imageInputRef.current?.click()}>{icon("image")}<span><b>{selected?.element.tagName === "IMG" ? "이미지 교체" : "이미지 추가"}</b><small>JPG, PNG, WEBP, SVG</small></span></button></section>
            <section className={styles.selection}><div className={styles.sectionTitle}><span>선택한 요소</span></div>{selected ? <><div className={styles.selectedLabel}><span>{selected.element.tagName.toLowerCase()}</span><strong>{selected.label}</strong></div><button className={styles.deleteButton} onClick={removeSelected}>{icon("trash")} 선택 요소 삭제</button></> : <p>미리보기에서 글자나 이미지를 선택하세요. 글자는 화면에서 바로 입력할 수 있습니다.</p>}</section>
          </aside>
          <section className={styles.stage}>
            <div className={styles.toolbar}><div className={styles.status}><i />{status}</div><div className={styles.toolbarActions}><button onClick={undo} disabled={!history.length}>{icon("undo")} 실행 취소</button><div className={styles.viewportSwitch}><button className={viewport === "mobile" ? styles.active : ""} onClick={() => setViewport("mobile")} aria-label="모바일 보기">{icon("phone")}</button><button className={viewport === "desktop" ? styles.active : ""} onClick={() => setViewport("desktop")} aria-label="데스크톱 보기">{icon("desktop")}</button></div></div></div>
            <div className={styles.canvas}><div className={`${styles.frameShell} ${styles[viewport]}`}><iframe ref={iframeRef} title="사이트 편집 미리보기" srcDoc={previewHtml} sandbox="allow-same-origin" onLoad={activateEditor} /></div></div>
          </section>
        </div>
      )}
      <input ref={zipInputRef} className={styles.hidden} type="file" accept=".zip,application/zip" onChange={(event) => { const file = event.target.files?.[0]; if (file) loadZip(file); event.target.value = ""; }} />
      <input ref={imageInputRef} className={styles.hidden} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={addOrReplaceImage} />
    </main>
  );
}
