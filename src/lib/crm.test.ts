import assert from "node:assert/strict";
import test from "node:test";
import { centralCrmLoaderUrl, centralCrmPlaceholder, CRM_BATCH_ORIGIN, CRM_ORIGIN, slugCrmLoaders, slugCrmSignature } from "./crm";

test("uses repeatable data-token placeholders",()=>{
  assert.equal(centralCrmPlaceholder("a".repeat(40),'Loan "A"'),`<div data-crm-token="${"a".repeat(40)}" data-loantype="Loan &quot;A&quot;"></div>`);
});

test("deduplicates tokens into one batch loader",()=>{
  const a="a".repeat(40),b="b".repeat(40);
  assert.equal(centralCrmLoaderUrl([a,a]),CRM_ORIGIN+a);
  assert.equal(centralCrmLoaderUrl([a,b,a]),CRM_BATCH_ORIGIN+a+","+b);
});

test("discovers versioned slug CRM loaders generically",()=>{
  const html=`<div data-maycrm-embed="speedycashfinance-desktop"></div>
    <script src="https://maycrm.kimzahost.website/wp-json/maycrm/v1/loader.js?slug=speedycashfinance-desktop&amp;v=1.5.0"></script>
    <div data-kimcrm-embed="bitnaloan-mobile"></div>
    <script src="https://kim.kimzahost.website/wp-json/kimcrm/v1/loader.js?slug=bitnaloan-mobile&v=1.4.0"></script>`;
  assert.deepEqual(slugCrmLoaders(html),[
    { namespace:"maycrm",attribute:"data-maycrm-embed",slug:"speedycashfinance-desktop",src:"https://maycrm.kimzahost.website/wp-json/maycrm/v1/loader.js?slug=speedycashfinance-desktop&v=1.5.0" },
    { namespace:"kimcrm",attribute:"data-kimcrm-embed",slug:"bitnaloan-mobile",src:"https://kim.kimzahost.website/wp-json/kimcrm/v1/loader.js?slug=bitnaloan-mobile&v=1.4.0" },
  ]);
  assert.deepEqual(slugCrmSignature(html),["maycrm|speedycashfinance-desktop","kimcrm|bitnaloan-mobile"]);
});

test("rejects CRM loaders whose host and API namespace do not match",()=>{
  assert.deepEqual(slugCrmLoaders(`<script src="https://evil.test/wp-json/maycrm/v1/loader.js?slug=x"></script>`),[]);
  assert.deepEqual(slugCrmLoaders(`<script src="https://kim.kimzahost.website/wp-json/maycrm/v1/loader.js?slug=x"></script>`),[]);
});

test("derives the CRM namespace needed to remove rendered state",()=>{
  const [loader]=slugCrmLoaders(`<script src="https://maycrm.kimzahost.website/wp-json/maycrm/v1/loader.js?slug=speedycashfinance-mobile&v=1.5.0"></script>`);
  assert.equal(`data-${loader.namespace}-rendered`,"data-maycrm-rendered");
});
