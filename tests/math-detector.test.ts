import { describe, it, expect } from "vitest";
import { findMathElement } from "../src/content/math-detector";

// ─── 辅助：把 HTML 字符串插入 document.body，返回指定 id 的元素 ───────────
function mount(html: string, targetId: string): HTMLElement {
  document.body.innerHTML = html;
  const el = document.getElementById(targetId);
  if (!el) throw new Error(`Element #${targetId} not found`);
  return el;
}

describe("findMathElement", () => {
  it("点击非公式元素返回 null", () => {
    const el = mount(`<p id="t">Hello world</p>`, "t");
    expect(findMathElement(el)).toBeNull();
  });

  it("点击 .katex 返回命中，行内公式", () => {
    const el = mount(`<span class="katex" id="t">x^2</span>`, "t");
    const result = findMathElement(el);
    expect(result).not.toBeNull();
    expect(result!.element.classList.contains("katex")).toBe(true);
    expect(result!.isDisplay).toBe(false);
  });

  it("点击 .katex-display 返回命中，块级公式", () => {
    const el = mount(`<div class="katex-display" id="t">x^2</div>`, "t");
    const result = findMathElement(el);
    expect(result).not.toBeNull();
    expect(result!.isDisplay).toBe(true);
  });

  it("点击 .katex 内部子元素，向上找到 .katex", () => {
    const inner = mount(
      `<span class="katex" id="outer"><span id="t">inner</span></span>`,
      "t"
    );
    const result = findMathElement(inner);
    expect(result).not.toBeNull();
    expect(result!.element.id).toBe("outer");
  });

  it(".katex-display 包裹 .katex 时，优先返回更外层的 .katex-display", () => {
    // 典型 KaTeX 结构：.katex-display > .katex > ...
    const inner = mount(
      `<div class="katex-display" id="outer">
         <span class="katex" id="inner">
           <span id="t">formula</span>
         </span>
       </div>`,
      "t"
    );
    const result = findMathElement(inner);
    expect(result).not.toBeNull();
    expect(result!.element.id).toBe("outer");
    expect(result!.isDisplay).toBe(true);
  });

  it("点击 [data-math] 元素", () => {
    const el = mount(`<span data-math="E=mc^2" id="t"></span>`, "t");
    const result = findMathElement(el);
    expect(result).not.toBeNull();
    expect(result!.element.getAttribute("data-math")).toBe("E=mc^2");
  });

  it("点击 .math-inline 返回行内公式", () => {
    const el = mount(`<span class="math-inline" id="t">x</span>`, "t");
    const result = findMathElement(el);
    expect(result).not.toBeNull();
    expect(result!.isDisplay).toBe(false);
  });

  it("点击 .math-block 返回块级公式", () => {
    const el = mount(`<div class="math-block" id="t">x</div>`, "t");
    const result = findMathElement(el);
    expect(result).not.toBeNull();
    expect(result!.isDisplay).toBe(true);
  });

  it("点击 mjx-container[display=true] 返回块级公式", () => {
    const el = mount(
      `<mjx-container display="true" id="t"></mjx-container>`,
      "t"
    );
    const result = findMathElement(el);
    expect(result).not.toBeNull();
    expect(result!.isDisplay).toBe(true);
  });

  it("点击 mjx-container（无 display 属性）返回行内公式", () => {
    const el = mount(`<mjx-container id="t"></mjx-container>`, "t");
    const result = findMathElement(el);
    expect(result).not.toBeNull();
    expect(result!.isDisplay).toBe(false);
  });

  it("target 为 null 时返回 null", () => {
    expect(findMathElement(null)).toBeNull();
  });

  it("target 不是 HTMLElement（如 TextNode）时返回 null", () => {
    const textNode = document.createTextNode("hello");
    expect(findMathElement(textNode)).toBeNull();
  });

  it(".math-block 内部的子元素点击，isDisplay 为 true", () => {
    const inner = mount(
      `<div class="math-block" id="outer"><span id="t">inner</span></div>`,
      "t"
    );
    const result = findMathElement(inner);
    expect(result).not.toBeNull();
    expect(result!.isDisplay).toBe(true);
  });
});
