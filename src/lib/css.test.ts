import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { BUNDLED_FONT_NAMES, bundledSCoreFontName, formatStaticCounter, normalizeFullWidthBackgroundStyle, rewriteCssAssetUrls, S_CORE_FONT_FACES, stripInlineStyleProperties } from "./css";

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

test("removes CSS dependencies that cannot be downloaded in standalone mode",async()=>{
  const css=await rewriteCssAssetUrls(`.hero{background:url(https://site.test/missing.png)}@import "https://site.test/missing.css";`,new URL("https://site.test/page"),"html",async()=>{ throw new Error("offline"); },true);
  assert.equal(css,`.hero{background:url("")}`);
  assert.doesNotMatch(css,/https?:\/\//);
});

test("replaces frozen desktop geometry with responsive full-bleed geometry",()=>{
  const output=normalizeFullWidthBackgroundStyle("background-size:cover;min-width:1440px;left:-135px;width:1440px;");
  assert.match(output,/background-size:cover/);
  assert.doesNotMatch(output,/1440px|-135px/);
  assert.match(output,/min-width: 100vw; left: 50%; right: auto; margin-left: -50vw; width: 100vw;/);
});

test("recognizes S-Core Dream font URLs for fixed-name reuse",()=>{
  assert.equal(bundledSCoreFontName(new URL("https://example.com/fonts/SCDream4.woff2?v=2")),"SCDream4.woff2");
  assert.equal(bundledSCoreFontName(new URL("https://example.com/fonts/scdream9-webfont.woff2")),"SCDream9.woff2");
  assert.equal(bundledSCoreFontName(new URL("https://example.com/fonts/other.woff2")),undefined);
});

test("ships all nine canonical S-Core Dream files and family declarations",async()=>{
  const expected=[
    "fb2ca6d8596c0f74de27affb68db5316772eeba64ab485be27bc4afd9e19da81",
    "eab4125edea401bdfc8ea97247ae7ce00fe4d0fc9772149ddc6ca5635f65f267",
    "f7b91484486d30b1adad1d7529a3b3e9e4de42298e360dd42c807b2d08080b7c",
    "fb32a0b2d8bca3abd622851653464ec5359b6a19257a825cfd0d755f026a0553",
    "77544b9b95e35a95d78ffd461b82f1f4c1d3b5a40d4ed35e8fee70bd92f8f9e3",
    "36ad73dda443e42205b029d2e76078b837933249801c748223af6f6b6e25b163",
    "9f84617b1bc267174ec97df81fd07a71227520657ba177920597d04adfd94d31",
    "1585707328b05ee6d26801539978fe612e8c1e7599ff7ea5a304d7fd9567d69e",
    "56e0d77cecbf95a8ea6bcc718b69c27827396a7e1e412c6a6bbda6d3c9d795c7",
  ];
  assert.equal(BUNDLED_FONT_NAMES.length,9);
  for(const [index,name] of BUNDLED_FONT_NAMES.entries()) {
    const buffer=await readFile(join(process.cwd(),"bundled-fonts",name));
    assert.equal(createHash("sha256").update(buffer).digest("hex"),expected[index]);
    assert.match(S_CORE_FONT_FACES,new RegExp(`font-family: 'S-Core${index+1}'`));
    assert.match(S_CORE_FONT_FACES,new RegExp(`url\\('${name.replace(".","\\.")}'\\)`));
  }
});

test("materializes counter values without animation",()=>{
  assert.equal(formatStaticCounter("2928",",","."),"2,928");
  assert.equal(formatStaticCounter("12345.67"," ",","),"12 345,67");
  assert.equal(formatStaticCounter("1000","","."),"1000");
});

test("removes frozen carousel geometry without losing other inline styles",()=>{
  assert.equal(stripInlineStyleProperties("opacity:1;width:0px;transform:translate3d(0,0,0);color:red",["width","transform"]),"opacity:1;color:red");
});
