import assert from "node:assert/strict";
import test from "node:test";
import { stripNonGoogleScriptsFromHtml } from "./scripts";

test("removes WordPress scripts hidden inside conditional comments",()=>{
  const result=stripNonGoogleScriptsFromHtml('<!--[if lt IE 9]><script src="/wp-content/themes/site/html5.js"></script><![endif]--><main>OK</main>');
  assert.equal(result.removed,1);
  assert.doesNotMatch(result.html,/html5\.js/);
  assert.match(result.html,/<main>OK<\/main>/);
});

test("preserves external and inline Google tracking scripts",()=>{
  const input='<script async src="https://www.googletagmanager.com/gtag/js?id=G-1"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}</script>';
  const result=stripNonGoogleScriptsFromHtml(input);
  assert.equal(result.removed,0);
  assert.equal(result.html,input);
});
