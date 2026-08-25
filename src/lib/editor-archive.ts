export function cleanZipPath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

export function isRemoteReference(value: string) {
  return /^(?:[a-z]+:|\/\/|#|data:|blob:)/i.test(value.trim());
}

export function resolveZipReference(baseFile: string, reference: string) {
  const cleanReference = reference.split(/[?#]/, 1)[0];
  if (!cleanReference || isRemoteReference(cleanReference)) return null;
  const parts = `${baseFile.includes("/") ? baseFile.slice(0, baseFile.lastIndexOf("/") + 1) : ""}${cleanReference}`.split("/");
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  }
  return resolved.join("/");
}

export function relativeZipReference(fromFile: string, toFile: string) {
  const from = cleanZipPath(fromFile).split("/").slice(0, -1);
  const to = cleanZipPath(toFile).split("/");
  while (from.length && to.length && from[0] === to[0]) {
    from.shift();
    to.shift();
  }
  return `${"../".repeat(from.length)}${to.join("/")}` || "./";
}

export function findIndexFile(paths: string[]) {
  return paths
    .map(cleanZipPath)
    .filter((path) => /(^|\/)index\.html?$/i.test(path))
    .sort((a, b) => a.split("/").length - b.split("/").length || a.length - b.length)[0] ?? null;
}

export function safeUploadName(name: string) {
  const extension = name.includes(".") ? `.${name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")}` : "";
  const stem = name.replace(/\.[^.]+$/, "").normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 54) || "image";
  return `${stem}-${Date.now()}${extension}`;
}
