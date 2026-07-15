import type { CheerioAPI } from "cheerio";
import { formatStaticCounter, stripInlineStyleProperties } from "./css";

export function normalizeStaticWidgets($:CheerioAPI) {
  let counters=0;
  let carousels=0;
  $(".stats-number[data-counter-value]").each((_,element)=>{
    const node=$(element);
    node.text(formatStaticCounter(node.attr("data-counter-value") || "",node.attr("data-separator") ?? ",",node.attr("data-decimal") ?? "."));
    counters++;
  });
  $(".ult-carousel-wrapper.ult_horizontal").each((_,element)=>{
    const carousel=$(element);
    carousel.attr("data-static-carousel","");
    carousel.find(".slick-cloned").remove();
    carousel.find(".slick-track").each((__,track)=>{
      const node=$(track);
      node.attr("style",stripInlineStyleProperties(node.attr("style") || "",["width","transform","-webkit-transform"]));
    });
    carousel.find(".slick-slide").each((__,slide)=>{
      const node=$(slide);
      node.attr("style",stripInlineStyleProperties(node.attr("style") || "",["width"]));
    });
    carousels++;
  });
  return { counters,carousels };
}
