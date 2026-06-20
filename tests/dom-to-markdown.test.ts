import { describe, it, expect } from "vitest";
import { convertElementToMarkdown } from "../src/content/dom-to-markdown";

function el(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

describe("convertElementToMarkdown", () => {
  it("纯文本原样输出", () => {
    const result = convertElementToMarkdown(el("Hello world"));
    expect(result).toBe("Hello world");
  });

  it("段落标签之间保留换行", () => {
    const result = convertElementToMarkdown(el("<p>第一段</p><p>第二段</p>"));
    expect(result).toContain("第一段");
    expect(result).toContain("第二段");
    // 两段之间有换行分隔
    expect(result.indexOf("第一段")).toBeLessThan(result.indexOf("第二段"));
  });

  it("<br> 转换为换行", () => {
    const result = convertElementToMarkdown(el("第一行<br>第二行"));
    expect(result).toBe("第一行\n第二行");
  });

  it("行内公式（.katex + data-math）转换为 $...$", () => {
    const root = el(
      `<span>质能方程是 </span><span class="katex" data-math="E=mc^2"></span><span>。</span>`
    );
    const result = convertElementToMarkdown(root);
    expect(result).toBe("质能方程是 $E=mc^2$。");
  });

  it("块级公式（.katex-display + data-math）转换为 $$...$$", () => {
    const root = el(
      `<p>公式如下：</p><div class="katex-display" data-math="\\int_0^1 x^2 dx"></div>`
    );
    const result = convertElementToMarkdown(root);
    expect(result).toContain("$$\\int_0^1 x^2 dx$$");
  });

  it("公式子节点不被重复遍历", () => {
    // .katex 内部有 aria-hidden 的渲染层和 MathML，不应出现重复内容
    const root = el(
      `<span class="katex" data-math="x^2">` +
        `<span class="katex-mathml"><math><annotation encoding="application/x-tex">x^2</annotation></math></span>` +
        `<span class="katex-html" aria-hidden="true">x²渲染文字</span>` +
      `</span>`
    );
    const result = convertElementToMarkdown(root);
    // 只出现一次公式，aria-hidden 的渲染层被跳过
    expect(result).toBe("$x^2$");
    expect(result).not.toContain("x²渲染文字");
  });

  it("aria-hidden 节点被完全跳过", () => {
    const root = el(`<div>可见文字<span aria-hidden="true">隐藏文字</span></div>`);
    const result = convertElementToMarkdown(root);
    expect(result).toBe("可见文字");
    expect(result).not.toContain("隐藏文字");
  });

  it("代码块内部不转换公式", () => {
    const root = el(
      `<pre><code>$E=mc^2$ 是 LaTeX</code></pre>`
    );
    const result = convertElementToMarkdown(root);
    // 代码块原样保留，不做任何转换
    expect(result).toContain("$E=mc^2$ 是 LaTeX");
  });

  it("多个行内公式各自转换", () => {
    const root = el(
      `<span class="katex" data-math="a+b"></span>` +
      ` 和 ` +
      `<span class="katex" data-math="c+d"></span>`
    );
    const result = convertElementToMarkdown(root);
    expect(result).toBe("$a+b$ 和 $c+d$");
  });

  it("无公式的选区返回纯文本", () => {
    const root = el("<p>普通文字，没有公式。</p>");
    const result = convertElementToMarkdown(root);
    expect(result).toBe("普通文字，没有公式。");
  });
});
