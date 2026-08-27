import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { assertSafePublicUrl } from "./security";

const originalAllowLocalSources = process.env.ALLOW_LOCAL_SOURCES;
const originalVercel = process.env.VERCEL;

afterEach(() => {
  if (originalAllowLocalSources === undefined) delete process.env.ALLOW_LOCAL_SOURCES;
  else process.env.ALLOW_LOCAL_SOURCES = originalAllowLocalSources;
  if (originalVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = originalVercel;
});

test("blocks localhost by default", async () => {
  delete process.env.ALLOW_LOCAL_SOURCES;
  delete process.env.VERCEL;
  await assert.rejects(assertSafePublicUrl("http://localhost:8080/design/"), /Localhost sources are blocked/);
});

test("allows loopback hosts when native local-source mode is enabled", async () => {
  process.env.ALLOW_LOCAL_SOURCES = "true";
  delete process.env.VERCEL;
  for (const source of ["http://localhost:8080/", "http://127.0.0.1:4173/", "http://127.12.3.4/", "http://[::1]:3000/"]) {
    assert.equal((await assertSafePublicUrl(source)).href, source);
  }
});

test("keeps localhost blocked on Vercel", async () => {
  process.env.ALLOW_LOCAL_SOURCES = "true";
  process.env.VERCEL = "1";
  await assert.rejects(assertSafePublicUrl("http://127.0.0.1:8080/"), /Localhost sources are blocked/);
});

test("does not expand local-source mode to private network hosts", async () => {
  process.env.ALLOW_LOCAL_SOURCES = "true";
  delete process.env.VERCEL;
  await assert.rejects(assertSafePublicUrl("http://192.168.1.20/"), /private or unsafe/);
});
