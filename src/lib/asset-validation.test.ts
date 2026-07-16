import assert from "node:assert/strict";
import test from "node:test";
import { assertDesignAssetPayload } from "./asset-validation";

test("rejects legacy CUPID challenge pages masquerading as design assets",()=>{
  const body=Buffer.from('<html><body><script src="/cupid.js"></script></body></html>');
  assert.throws(()=>assertDesignAssetPayload(body,"image/jpeg",new URL("https://site.test/background.jpg")),/HTML challenge/i);
});

test("accepts real CSS and image payloads",()=>{
  assert.doesNotThrow(()=>assertDesignAssetPayload(Buffer.from(".vc_row{display:flex}"),"text/css",new URL("https://site.test/grid.css")));
  assert.doesNotThrow(()=>assertDesignAssetPayload(Buffer.from([0x89,0x50,0x4e,0x47]),"image/png",new URL("https://site.test/logo.png")));
});
