import assert from "node:assert/strict";
import test from "node:test";
import { centralCrmLoaderUrl, centralCrmPlaceholder, CRM_BATCH_ORIGIN, CRM_ORIGIN } from "./crm";

test("uses repeatable data-token placeholders",()=>{
  assert.equal(centralCrmPlaceholder("a".repeat(40),'Loan "A"'),`<div data-crm-token="${"a".repeat(40)}" data-loantype="Loan &quot;A&quot;"></div>`);
});

test("deduplicates tokens into one batch loader",()=>{
  const a="a".repeat(40),b="b".repeat(40);
  assert.equal(centralCrmLoaderUrl([a,a]),CRM_ORIGIN+a);
  assert.equal(centralCrmLoaderUrl([a,b,a]),CRM_BATCH_ORIGIN+a+","+b);
});
