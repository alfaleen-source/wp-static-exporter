import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateIp(address: string) {
  const value = address.toLowerCase();
  if (value === "::1" || value === "::" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:")) return true;
  if (value.startsWith("::ffff:")) return isPrivateIp(value.slice(7));
  if (isIP(value) !== 4) return false;
  const [a, b] = value.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 0) || (a === 192 && b === 168) || a >= 224;
}

export async function assertSafePublicUrl(input: string) {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("Enter a complete URL beginning with http:// or https://."); }
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only HTTP and HTTPS URLs are supported.");
  if (url.username || url.password) throw new Error("URLs containing credentials are not supported.");
  if (["localhost", "localhost.localdomain"].includes(url.hostname.toLowerCase())) throw new Error("Local network addresses are blocked.");
  const records = await lookup(url.hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isPrivateIp(record.address))) throw new Error("That hostname resolves to a private or unsafe network address.");
  return url;
}

export function safeOutputName(value: string, fallback: string) {
  const clean = (value || fallback).normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return clean || "static-site";
}
