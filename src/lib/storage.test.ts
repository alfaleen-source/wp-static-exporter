import assert from "node:assert/strict";
import test from "node:test";
import { assertManagedDeletion,managedBlobKind } from "./storage";

test("classifies only exporter-owned Blob prefixes",()=>{
  assert.equal(managedBlobKind("exports/site.zip"),"Full export");assert.equal(managedBlobKind("repairs/site.zip"),"Repair patch");assert.equal(managedBlobKind("cleanups/site.zip"),"Cleaned export");assert.equal(managedBlobKind("cleanup-inputs/site.zip"),"Temporary upload");assert.equal(managedBlobKind("avatars/person.png"),undefined);
});

test("allows exact current managed paths and rejects unrelated, stale, or duplicate deletion",()=>{
  const current=new Set(["exports/one.zip","repairs/two.zip"]);assert.deepEqual(assertManagedDeletion(["exports/one.zip"],current),["exports/one.zip"]);
  assert.throws(()=>assertManagedDeletion(["avatars/person.png"],current),/refused/);assert.throws(()=>assertManagedDeletion(["exports/missing.zip"],current),/refused/);assert.throws(()=>assertManagedDeletion(["exports/one.zip","exports/one.zip"],current),/duplicate/);assert.throws(()=>assertManagedDeletion([],current),/between 1 and 50/);
});
