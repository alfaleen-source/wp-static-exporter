"use client";
/* eslint-disable react-hooks/immutability -- The editor intentionally mutates DOM nodes inside a sandboxed iframe. */

import JSZip from "jszip";
import Link from "next/link";
import { ChangeEvent, MouseEvent as ReactMouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { findIndexFile, relativeZipReference, resolveZipReference, safeUploadName } from "@/lib/editor-archive";
import styles from "./editor.module.css";

type Viewport = "mobile" | "desktop";
type Locale = "ko" | "en";
type Selected = { element: HTMLElement; label: string } | null;

const IMAGE_SELECTOR = "img";
const EDITOR_STYLE_ID = "xtractor-editor-style";
const TEXT_WRAPPER_ATTRIBUTE = "data-x-text-wrapper";
const NON_EDITABLE_SELECTOR = "script,style,svg,canvas,iframe,object,embed,video,audio,input,textarea,select,option,noscript,template";

const copy = {
  ko: {
    home: "Xtractor 홈", privacy: "브라우저 안에서만 처리됩니다", saveZip: "편집 ZIP 저장",
    start: "ZIP 파일을 업로드해 시작하세요", eyebrow: "NO-CODE CONTENT EDITOR", heroA: "디자인은 그대로,", heroB: "한국어 콘텐츠만 쉽게.",
    intro: "완성된 독립형 사이트 ZIP을 올리고 텍스트와 이미지를 직접 편집한 뒤 새 ZIP으로 저장하세요.", loading: "사이트를 불러오는 중...", upload: "사이트 ZIP 업로드", drop: "클릭하거나 ZIP 파일을 여기에 놓으세요 · 최대 100MB",
    preserve: "디자인 보존", preserveNote: "기존 HTML과 CSS 구조를 유지합니다.", safeDelete: "안전한 삭제", safeDeleteNote: "확인 단계와 실행 취소를 제공합니다.", private: "비공개 처리", privateNote: "파일을 서버에 업로드하지 않습니다.",
    replace: "교체", add: "추가하기", addHint: "선택 영역 아래에 배치", addHeading: "제목 추가", headingHint: "새로운 섹션 제목", addParagraph: "문단 추가", paragraphHint: "설명 또는 안내 문구", replaceImage: "이미지 교체", addImage: "이미지 추가",
    selected: "선택한 요소", deleteSelected: "선택 요소 삭제", selectHelp: "미리보기에서 글자나 이미지를 선택하세요. 글자는 화면에서 바로 입력할 수 있습니다.", undo: "실행 취소", mobileView: "모바일 보기", desktopView: "데스크톱 보기", preview: "사이트 편집 미리보기",
    zipOnly: "ZIP 파일만 업로드할 수 있습니다", zipSize: "ZIP 파일은 100MB 이하로 업로드해 주세요", loadingSafe: "사이트를 안전하게 불러오는 중입니다...", tooMany: "파일 수가 5,000개를 초과합니다", noIndex: "index.html 파일을 찾을 수 없습니다", ready: (name: string) => `${name} 준비 완료`, openError: "ZIP 파일을 열 수 없습니다",
    pending: "수정 사항이 저장 대기 중입니다", image: "이미지", element: (tag: string) => `${tag} 요소`, newHeading: "새로운 제목을 입력하세요", newParagraph: "새로운 내용을 입력하세요.", textAdded: "새 텍스트를 추가했습니다", confirmDelete: "선택한 요소를 삭제할까요? 실행 취소로 복원할 수 있습니다.", deleted: "요소를 삭제했습니다", undone: "마지막 작업을 취소했습니다", uploadedAlt: "업로드 이미지", imageApplied: "이미지를 적용했습니다", creating: "편집된 ZIP 파일을 만드는 중입니다...", downloaded: "편집된 사이트를 다운로드했습니다", exportError: "ZIP 파일을 만들 수 없습니다",
  },
  en: {
    home: "Xtractor home", privacy: "Processed only in your browser", saveZip: "Save edited ZIP",
    start: "Upload a ZIP file to begin", eyebrow: "NO-CODE CONTENT EDITOR", heroA: "Keep the design.", heroB: "Edit the content with ease.",
    intro: "Upload a completed standalone site ZIP, edit its text and images directly, then save a new ZIP.", loading: "Loading site...", upload: "Upload site ZIP", drop: "Click or drop a ZIP file here · Maximum 100MB",
    preserve: "Design preserved", preserveNote: "Keeps the existing HTML and CSS structure.", safeDelete: "Safe deletion", safeDeleteNote: "Includes confirmation and undo controls.", private: "Private editing", privateNote: "Files are never uploaded to a server.",
    replace: "Replace", add: "Add content", addHint: "Placed below the selected area", addHeading: "Add heading", headingHint: "New section heading", addParagraph: "Add paragraph", paragraphHint: "Description or information", replaceImage: "Replace image", addImage: "Add image",
    selected: "Selected element", deleteSelected: "Delete selected element", selectHelp: "Select text or an image in the preview. You can type directly into text on the page.", undo: "Undo", mobileView: "Mobile view", desktopView: "Desktop view", preview: "Site editor preview",
    zipOnly: "Please upload a ZIP file", zipSize: "Please upload a ZIP file smaller than 100MB", loadingSafe: "Loading the site safely...", tooMany: "The ZIP contains more than 5,000 files", noIndex: "No index.html file was found", ready: (name: string) => `${name} is ready`, openError: "The ZIP file could not be opened",
    pending: "Changes are waiting to be saved", image: "Image", element: (tag: string) => `${tag} element`, newHeading: "Enter a new heading", newParagraph: "Enter new paragraph text.", textAdded: "New text added", confirmDelete: "Delete the selected element? You can restore it with Undo.", deleted: "Element deleted", undone: "Last action undone", uploadedAlt: "Uploaded image", imageApplied: "Image applied", creating: "Creating the edited ZIP file...", downloaded: "Edited site downloaded", exportError: "The ZIP file could not be created",
  },
} as const;

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
  const [locale, setLocale] = useState<Locale>("ko");
  const t = copy[locale];
  const [archive, setArchive] = useState<JSZip | null>(null);
  const [indexPath, setIndexPath] = useState("");
  const [originalHtml, setOriginalHtml] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [fileName, setFileName] = useState("");
  const [selected, setSelected] = useState<Selected>(null);
  const [viewport, setViewport] = useState<Viewport>("mobile");
  const [history, setHistory] = useState<string[]>([]);
  const [status, setStatus] = useState<string>(copy.ko.start);
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
    if (!file.name.toLowerCase().endsWith(".zip")) return setStatus(t.zipOnly);
    if (file.size > 100 * 1024 * 1024) return setStatus(t.zipSize);
    setBusy(true);
    setStatus(t.loadingSafe);
    try {
      const zip = await JSZip.loadAsync(file, { checkCRC32: true });
      const paths = Object.keys(zip.files);
      if (paths.length > 5000) throw new Error(t.tooMany);
      const entry = findIndexFile(paths);
      if (!entry) throw new Error(t.noIndex);
      const html = await zip.file(entry)!.async("text");
      const preview = await preparePreview(zip, html, entry);
      setArchive(zip);
      setIndexPath(entry);
      setOriginalHtml(html);
      setPreviewHtml(preview);
      setFileName(file.name.replace(/\.zip$/i, ""));
      setSelected(null);
      setHistory([]);
      setStatus(t.ready(file.name));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t.openError);
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

    // Make every visible text run editable, not just a small list of semantic tags.
    // Leaf elements can be edited as-is. Text mixed with icons, spans, or <br>
    // nodes is isolated in a temporary span so editing it cannot remove siblings.
    const showText = doc.defaultView?.NodeFilter.SHOW_TEXT ?? 4;
    const textNodes: Text[] = [];
    const walker = doc.createTreeWalker(doc.body, showText);
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

    textNodes.forEach((textNode) => {
      if (!textNode.data.trim()) return;
      const parent = textNode.parentElement;
      if (!parent || parent.closest(NON_EDITABLE_SELECTOR)) return;

      const meaningfulChildren = Array.from(parent.children).filter((child) => child.tagName !== "BR");
      let editable = parent;
      if (meaningfulChildren.length > 0 || parent.childNodes.length > 1) {
        const wrapper = doc.createElement("span");
        wrapper.setAttribute(TEXT_WRAPPER_ATTRIBUTE, "true");
        textNode.replaceWith(wrapper);
        wrapper.append(textNode);
        editable = wrapper;
      }
      editable.contentEditable = "true";
      editable.dataset.xEditable = "true";
      editable.spellcheck = true;
    });
    doc.querySelectorAll<HTMLElement>(IMAGE_SELECTOR).forEach((element) => { element.dataset.xImage = "true"; });
    doc.oninput = () => setStatus(t.pending);
    doc.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const eventTarget = event.target as HTMLElement;
      const target = eventTarget.closest<HTMLElement>("[data-x-editable],[data-x-image]")
        ?? eventTarget.closest<HTMLElement>("section,article,main,div");
      if (!target || target === doc.body || target === doc.documentElement) return;
      doc.querySelectorAll("[data-x-selected]").forEach((node) => node.removeAttribute("data-x-selected"));
      target.dataset.xSelected = "true";
      const label = target.tagName === "IMG" ? t.image : t.element(target.tagName.toLowerCase());
      setSelected({ element: target, label });
    };
  }

  function addText(tag: "h2" | "p") {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    remember();
    const element = doc.createElement(tag);
    element.textContent = tag === "h2" ? t.newHeading : t.newParagraph;
    element.contentEditable = "true";
    element.dataset.xEditable = "true";
    const container = selected?.element.closest("section,article,main,div") ?? doc.body;
    container.append(element);
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.focus();
    setSelected({ element, label: t.element(tag) });
    setStatus(t.textAdded);
  }

  function removeSelected() {
    if (!selected || !window.confirm(t.confirmDelete)) return;
    remember();
    selected.element.remove();
    setSelected(null);
    setStatus(t.deleted);
  }

  function undo() {
    const body = iframeRef.current?.contentDocument?.body;
    const previous = history.at(-1);
    if (!body || !previous) return;
    body.innerHTML = previous;
    setHistory((items) => items.slice(0, -1));
    setSelected(null);
    activateEditor();
    setStatus(t.undone);
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
    image.alt ||= t.uploadedAlt;
    image.dataset.xImage = "true";
    if (!image.isConnected) (selected?.element.closest("section,article,main,div") ?? doc.body).append(image);
    setSelected({ element: image, label: t.image });
    setStatus(t.imageApplied);
    event.target.value = "";
  }

  async function exportZip() {
    const currentDoc = iframeRef.current?.contentDocument;
    if (!archive || !currentDoc || !originalHtml) return;
    setBusy(true);
    setStatus(t.creating);
    try {
      const exportDoc = new DOMParser().parseFromString(originalHtml, "text/html");
      const body = currentDoc.body.cloneNode(true) as HTMLBodyElement;
      body.querySelectorAll<HTMLElement>("[data-export-src]").forEach((element) => {
        element.setAttribute("src", element.dataset.exportSrc ?? "");
      });
      body.querySelectorAll<HTMLElement>(`[${TEXT_WRAPPER_ATTRIBUTE}]`).forEach((wrapper) => wrapper.replaceWith(...Array.from(wrapper.childNodes)));
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
      setStatus(t.downloaded);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t.exportError);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => () => objectUrls.current.forEach(URL.revokeObjectURL), []);

  const preventDrop = (event: ReactMouseEvent) => event.preventDefault();
  const changeLocale = (next: Locale) => {
    setLocale(next);
    setStatus(archive ? copy[next].ready(`${fileName}.zip`) : copy[next].start);
  };

  return (
    <main className={styles.app}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label={t.home}><span className={styles.mark}>X</span><span>Xtractor <b>Content Studio</b></span></Link>
        <div className={styles.headerActions}>
          <span className={styles.privacy}>{t.privacy}</span>
          <div className={styles.languageSwitch} role="group" aria-label="Interface language"><button className={locale === "ko" ? styles.languageActive : ""} onClick={() => changeLocale("ko")} lang="ko">한국어</button><button className={locale === "en" ? styles.languageActive : ""} onClick={() => changeLocale("en")}>English</button></div>
          <button className={styles.exportButton} onClick={exportZip} disabled={!archive || busy}>{icon("download")} {t.saveZip}</button>
        </div>
      </header>

      {!archive ? (
        <section className={styles.welcome}>
          <div className={styles.intro}><span className={styles.eyebrow}>{t.eyebrow}</span><h1>{t.heroA}<br/><em>{t.heroB}</em></h1><p>{t.intro}</p></div>
          <button className={styles.dropzone} onClick={() => zipInputRef.current?.click()} onDragOver={preventDrop} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) loadZip(file); }} disabled={busy}>
            <span className={styles.uploadIcon}>{icon("upload")}</span><strong>{busy ? t.loading : t.upload}</strong><small>{t.drop}</small>
          </button>
          <div className={styles.promiseGrid}><div><b>01</b><strong>{t.preserve}</strong><span>{t.preserveNote}</span></div><div><b>02</b><strong>{t.safeDelete}</strong><span>{t.safeDeleteNote}</span></div><div><b>03</b><strong>{t.private}</strong><span>{t.privateNote}</span></div></div>
        </section>
      ) : (
        <div className={styles.workspace}>
          <aside className={styles.sidebar}>
            <div className={styles.fileCard}><span className={styles.fileBadge}>ZIP</span><div><strong>{fileName}</strong><small>{indexPath}</small></div><button onClick={() => zipInputRef.current?.click()}>{t.replace}</button></div>
            <section className={styles.toolSection}><div className={styles.sectionTitle}><span>{t.add}</span><small>{t.addHint}</small></div><button className={styles.toolButton} onClick={() => addText("h2")}>{icon("text")}<span><b>{t.addHeading}</b><small>{t.headingHint}</small></span></button><button className={styles.toolButton} onClick={() => addText("p")}>{icon("text")}<span><b>{t.addParagraph}</b><small>{t.paragraphHint}</small></span></button><button className={styles.toolButton} onClick={() => imageInputRef.current?.click()}>{icon("image")}<span><b>{selected?.element.tagName === "IMG" ? t.replaceImage : t.addImage}</b><small>JPG, PNG, WEBP, SVG</small></span></button></section>
            <section className={styles.selection}><div className={styles.sectionTitle}><span>{t.selected}</span></div>{selected ? <><div className={styles.selectedLabel}><span>{selected.element.tagName.toLowerCase()}</span><strong>{selected.element.tagName === "IMG" ? t.image : t.element(selected.element.tagName.toLowerCase())}</strong></div><button className={styles.deleteButton} onClick={removeSelected}>{icon("trash")} {t.deleteSelected}</button></> : <p>{t.selectHelp}</p>}</section>
          </aside>
          <section className={styles.stage}>
            <div className={styles.toolbar}><div className={styles.status}><i />{status}</div><div className={styles.toolbarActions}><button onClick={undo} disabled={!history.length}>{icon("undo")} {t.undo}</button><div className={styles.viewportSwitch}><button className={viewport === "mobile" ? styles.active : ""} onClick={() => setViewport("mobile")} aria-label={t.mobileView}>{icon("phone")}</button><button className={viewport === "desktop" ? styles.active : ""} onClick={() => setViewport("desktop")} aria-label={t.desktopView}>{icon("desktop")}</button></div></div></div>
            <div className={styles.canvas}><div className={`${styles.frameShell} ${styles[viewport]}`}><iframe ref={iframeRef} title={t.preview} srcDoc={previewHtml} sandbox="allow-same-origin" onLoad={activateEditor} /></div></div>
          </section>
        </div>
      )}
      <input ref={zipInputRef} className={styles.hidden} type="file" accept=".zip,application/zip" onChange={(event) => { const file = event.target.files?.[0]; if (file) loadZip(file); event.target.value = ""; }} />
      <input ref={imageInputRef} className={styles.hidden} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={addOrReplaceImage} />
    </main>
  );
}
