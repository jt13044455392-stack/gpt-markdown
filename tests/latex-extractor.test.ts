import { describe, it, expect } from "vitest";
import { stripMathDelimiters, extractLatex, looksLikeLatex } from "../src/content/latex-extractor";

// ─────────────────────────────────────────────────────────────────────────────
// stripMathDelimiters
// ─────────────────────────────────────────────────────────────────────────────
describe("stripMathDelimiters", () => {
  it("移除行内 $ 分隔符", () => {
    expect(stripMathDelimiters("$E=mc^2$")).toBe("E=mc^2");
  });

  it("移除块级 $$ 分隔符", () => {
    expect(stripMathDelimiters("$$\\frac{1}{2}$$")).toBe("\\frac{1}{2}");
  });

  it("移除 \\(...\\) 分隔符", () => {
    expect(stripMathDelimiters("\\(x+y\\)")).toBe("x+y");
  });

  it("移除 \\[...\\] 分隔符", () => {
    expect(stripMathDelimiters("\\[x+y\\]")).toBe("x+y");
  });

  it("无分隔符时原样返回", () => {
    expect(stripMathDelimiters("x+y")).toBe("x+y");
  });

  it("不破坏公式内部的 $ 符号（内部无嵌套分隔符）", () => {
    expect(stripMathDelimiters("$$a + b = c$$")).toBe("a + b = c");
  });

  it("处理首尾有多余空格的情况", () => {
    expect(stripMathDelimiters("  $E=mc^2$  ")).toBe("E=mc^2");
  });

  it("空字符串不报错", () => {
    expect(stripMathDelimiters("")).toBe("");
  });

  it("单个 $ 不误剥离", () => {
    expect(stripMathDelimiters("$")).toBe("$");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// looksLikeLatex
// ─────────────────────────────────────────────────────────────────────────────
describe("looksLikeLatex", () => {
  it("含 \\frac 视为 LaTeX", () => {
    expect(looksLikeLatex("\\frac{1}{2}")).toBe(true);
  });

  it("含 ^ 视为 LaTeX", () => {
    expect(looksLikeLatex("x^2")).toBe(true);
  });

  it("含 _ 视为 LaTeX", () => {
    expect(looksLikeLatex("x_n")).toBe(true);
  });

  it("含 = 视为 LaTeX", () => {
    expect(looksLikeLatex("a=b")).toBe(true);
  });

  it("纯自然语言文本不视为 LaTeX", () => {
    expect(looksLikeLatex("Hello world")).toBe(false);
  });

  it("空字符串不视为 LaTeX", () => {
    expect(looksLikeLatex("")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractLatex
// ─────────────────────────────────────────────────────────────────────────────
describe("extractLatex", () => {
  /** 构造一个带指定属性和子元素的 div */
  function makeEl(html: string): HTMLElement {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div;
  }

  it("优先返回 data-math 属性", () => {
    const el = document.createElement("div");
    el.setAttribute("data-math", "E=mc^2");
    expect(extractLatex(el)).toBe("E=mc^2");
  });

  it("从 annotation[encoding=application/x-tex] 提取", () => {
    const el = makeEl(
      `<math><semantics><annotation encoding="application/x-tex">\\frac{1}{2}</annotation></semantics></math>`
    );
    expect(extractLatex(el)).toBe("\\frac{1}{2}");
  });

  it("从 encoding 含 tex 的 annotation 提取", () => {
    const el = makeEl(
      `<math><semantics><annotation encoding="TeX">x^2</annotation></semantics></math>`
    );
    expect(extractLatex(el)).toBe("x^2");
  });

  it("任意 annotation 内容像 LaTeX 时提取", () => {
    const el = makeEl(
      `<math><semantics><annotation>\\sum_{i=0}^n</annotation></semantics></math>`
    );
    expect(extractLatex(el)).toBe("\\sum_{i=0}^n");
  });

  it("任意 annotation 内容不像 LaTeX 时跳过，返回 null", () => {
    const el = makeEl(
      `<math><semantics><annotation>hello world</annotation></semantics></math>`
    );
    expect(extractLatex(el)).toBeNull();
  });

  it("从 aria-label 提取（内容像 LaTeX）", () => {
    const el = document.createElement("div");
    el.setAttribute("aria-label", "x^2 + y^2 = z^2");
    expect(extractLatex(el)).toBe("x^2 + y^2 = z^2");
  });

  it("aria-label 不像 LaTeX 时跳过", () => {
    const el = document.createElement("div");
    el.setAttribute("aria-label", "some formula");
    expect(extractLatex(el)).toBeNull();
  });

  it("从 data-latex 属性提取", () => {
    const el = document.createElement("div");
    el.setAttribute("data-latex", "\\int_0^1");
    expect(extractLatex(el)).toBe("\\int_0^1");
  });

  it("从 data-tex 属性提取", () => {
    const el = document.createElement("div");
    el.setAttribute("data-tex", "\\sqrt{2}");
    expect(extractLatex(el)).toBe("\\sqrt{2}");
  });

  it("什么都找不到时返回 null", () => {
    const el = document.createElement("div");
    el.textContent = "plain text";
    expect(extractLatex(el)).toBeNull();
  });

  it("data-math 优先于 annotation", () => {
    const el = makeEl(
      `<div data-math="E=mc^2"><annotation encoding="application/x-tex">x^2</annotation></div>`
    );
    // makeEl 会把 data-math 放在 innerHTML 里，需要直接设置属性
    const el2 = document.createElement("div");
    el2.setAttribute("data-math", "E=mc^2");
    el2.innerHTML = `<annotation encoding="application/x-tex">x^2</annotation>`;
    expect(extractLatex(el2)).toBe("E=mc^2");
  });
});
