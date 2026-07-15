import assert from "node:assert/strict";
import test from "node:test";
import * as cheerio from "cheerio";
import { normalizeStaticWidgets } from "./static-widgets";

test("converts animated counters and frozen Slick markup to static state",()=>{
  const $=cheerio.load(`<div class="stats-number" data-counter-value="2928" data-separator=",">0</div>
    <div class="ult-carousel-wrapper ult_horizontal"><div class="slick-track" style="opacity:1;width:0px;transform:translate3d(0,0,0)">
      <div class="slick-slide" style="width:0px;color:red">One</div><div class="slick-slide slick-cloned">Clone</div>
    </div></div>`);
  assert.deepEqual(normalizeStaticWidgets($),{counters:1,carousels:1});
  assert.equal($(".stats-number").text(),"2,928");
  assert.equal($("[data-static-carousel]").length,1);
  assert.equal($(".slick-cloned").length,0);
  assert.doesNotMatch($(".slick-track").attr("style") || "",/width|transform/);
  assert.equal($(".slick-slide").attr("style"),"color:red");
});
