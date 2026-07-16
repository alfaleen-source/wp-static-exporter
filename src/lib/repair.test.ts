import assert from "node:assert/strict";
import test from "node:test";
import { repairExistingIndex } from "./repair";

test("rejects empty repair uploads before making network requests",async()=>{
  await assert.rejects(()=>repairExistingIndex("","https://example.com/"),/non-empty index\.html/i);
});
