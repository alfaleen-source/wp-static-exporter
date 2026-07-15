import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFullWidthBackgroundStyle, rewriteCssAssetUrls } from "./css";

const resolve=async (url:URL)=>`assets/${url.pathname.split("/").pop()}`;

test("repairs encoded and malformed inline background URLs",async()=>{
  const css='background-image:url(&quot;hero.png&quot;);mask:url(icon.svg;);';
  assert.equal(await rewriteCssAssetUrls(css,new URL("https://example.com/page"),"html",resolve),"background-image:url(assets/hero.png);mask:url(assets/icon.svg);");
});

test("makes downloaded stylesheet URLs relative to the assets folder",async()=>{
  const css='@import "theme.css" screen; .hero{background:url("../img/hero image.png")}';
  assert.equal(await rewriteCssAssetUrls(css,new URL("https://example.com/css/site.css"),"asset",resolve),'@import url(theme.css) screen; .hero{background:url(hero%20image.png)}');
});

test("does not rewrite embedded data URLs",async()=>{
  const css='.icon{background:url("data:image/svg+xml,%3Csvg%3E")}' ;
  assert.equal(await rewriteCssAssetUrls(css,new URL("https://example.com/"),"html",resolve),css);
});

test("replaces frozen desktop geometry with responsive full-bleed geometry",()=>{
  const output=normalizeFullWidthBackgroundStyle("background-size:cover;min-width:1440px;left:-135px;width:1440px;");
  assert.match(output,/background-size:cover/);
  assert.doesNotMatch(output,/1440px|-135px/);
  assert.match(output,/min-width: 100vw; left: 50%; right: auto; margin-left: -50vw; width: 100vw;/);
});
