import { describe, it, expect } from "vitest";
import { convertReplyToMarkdown } from "../src/content/reply-to-markdown";

function el(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

describe("convertReplyToMarkdown", () => {
  it("普通文本原样输出", () => {
    expect(convertReplyToMarkdown(el("<p>Hello world</p>"))).toBe("Hello world");
  });

  it("行内公式转为 \\(...\\)", () => {
    const root = el(
      `<p>质能方程是 <span class="katex" data-math="E=mc^2"></span>。</p>`
    );
    expect(convertReplyToMarkdown(root)).toBe("质能方程是 \\(E=mc^2\\)。");
  });

  it("块级公式转为 \\[...\\]", () => {
    const root = el(
      `<p>公式：</p><div class="katex-display" data-math="\\int_0^1 x^2 dx"></div>`
    );
    const result = convertReplyToMarkdown(root);
    expect(result).toContain("\\[\n\\int_0^1 x^2 dx\n\\]");
  });

  it("清理 ChatGPT 错误格式 [ ... ]", () => {
    // 模拟已经带有方括号分隔符的 LaTeX
    const root = el(
      `<div class="katex-display" data-math="[ \\Delta \\sim \\mathcal O(1-10) ]"></div>`
    );
    const result = convertReplyToMarkdown(root);
    // 应输出正确的 \[...\]，不应有双层方括号
    expect(result).toContain("\\[");
    expect(result).toContain("\\]");
    expect(result).not.toContain("[ [");
    expect(result).toContain("\\Delta");
  });

  it("代码块转为 Markdown 代码块", () => {
    const root = el(
      `<pre><code class="language-js">console.log("hi");</code></pre>`
    );
    const result = convertReplyToMarkdown(root);
    expect(result).toContain("```js");
    expect(result).toContain('console.log("hi");');
    expect(result).toContain("```");
  });

  it("aria-hidden 节点被跳过，公式不重复", () => {
    const root = el(
      `<span class="katex" data-math="x^2">` +
        `<span class="katex-mathml"><math><annotation encoding="application/x-tex">x^2</annotation></math></span>` +
        `<span class="katex-html" aria-hidden="true">x²渲染</span>` +
      `</span>`
    );
    const result = convertReplyToMarkdown(root);
    expect(result).toBe("\\(x^2\\)");
    expect(result).not.toContain("x²渲染");
  });

  it("无序列表", () => {
    const root = el(`<ul><li>第一项</li><li>第二项</li></ul>`);
    const result = convertReplyToMarkdown(root);
    expect(result).toContain("- 第一项");
    expect(result).toContain("- 第二项");
  });

  it("有序列表", () => {
    const root = el(`<ol><li>第一项</li><li>第二项</li></ol>`);
    const result = convertReplyToMarkdown(root);
    expect(result).toContain("1. 第一项");
    expect(result).toContain("2. 第二项");
  });

  it("标题转为 Markdown 标题", () => {
    const root = el(`<h2>重要结论</h2>`);
    expect(convertReplyToMarkdown(root)).toContain("## 重要结论");
  });
});
