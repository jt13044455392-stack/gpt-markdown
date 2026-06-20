import { describe, it, expect } from "vitest";
import { wrapAsMarkdownMath, normalizeLatexToSingleLine } from "../src/content/markdown-wrapper";

describe("normalizeLatexToSingleLine", () => {
  it("单行输入保持不变", () => {
    expect(normalizeLatexToSingleLine("\\Delta \\sim \\mathcal O(1-10)")).toBe(
      "\\Delta \\sim \\mathcal O(1-10)"
    );
  });

  it("多行输入转换为单行，换行变空格", () => {
    expect(
      normalizeLatexToSingleLine(`
\\hat{\\phi}(\\vec{x}, t) = \\int \\frac{d^3 k}{(2\\pi)^3}
\\frac{1}{2 \\omega_{\\vec{k}}}
`)
    ).toBe("\\hat{\\phi}(\\vec{x}, t) = \\int \\frac{d^3 k}{(2\\pi)^3} \\frac{1}{2 \\omega_{\\vec{k}}}");
  });

  it("合并连续多个空格为单个", () => {
    expect(normalizeLatexToSingleLine("\\Delta  \\sim   \\mathcal O")).toBe(
      "\\Delta \\sim \\mathcal O"
    );
  });

  it("去掉首尾空白", () => {
    expect(normalizeLatexToSingleLine("  \\Delta \\sim \\mathcal O  ")).toBe(
      "\\Delta \\sim \\mathcal O"
    );
  });

  it("保留 LaTeX 换行命令 \\\\", () => {
    expect(normalizeLatexToSingleLine("line1 \\\\ line2")).toBe("line1 \\\\ line2");
  });
});

describe("wrapAsMarkdownMath", () => {
  it("行内公式：无分隔符输入", () => {
    expect(wrapAsMarkdownMath("E=mc^2", false)).toBe("$E=mc^2$");
  });

  it("块级公式：无分隔符输入，单行格式", () => {
    expect(wrapAsMarkdownMath("E=mc^2", true)).toBe("$$E=mc^2$$");
  });

  it("行内公式：输入已有 $ 分隔符，不重复包装", () => {
    expect(wrapAsMarkdownMath("$E=mc^2$", false)).toBe("$E=mc^2$");
  });

  it("块级公式：输入已有 $$ 分隔符，不重复包装，单行格式", () => {
    expect(wrapAsMarkdownMath("$$E=mc^2$$", true)).toBe("$$E=mc^2$$");
  });

  it("行内公式：输入带 \\(...\\) 分隔符", () => {
    expect(wrapAsMarkdownMath("\\(a+b\\)", false)).toBe("$a+b$");
  });

  it("块级公式：输入带 \\[...\\] 分隔符，单行格式", () => {
    expect(wrapAsMarkdownMath("\\[a+b\\]", true)).toBe("$$a+b$$");
  });

  it("复杂公式行内", () => {
    expect(wrapAsMarkdownMath("\\frac{1}{2}", false)).toBe("$\\frac{1}{2}$");
  });

  it("复杂公式块级，单行格式", () => {
    expect(wrapAsMarkdownMath("\\int_0^1 x^2 dx = \\frac{1}{3}", true)).toBe(
      "$$\\int_0^1 x^2 dx = \\frac{1}{3}$$"
    );
  });

  it("多行块级公式输入，输出为单行", () => {
    expect(
      wrapAsMarkdownMath(
        `
\\hat{\\phi}(\\vec{x}, t) = \\int \\frac{d^3 k}{(2\\pi)^3}
\\frac{1}{2 \\omega_{\\vec{k}}} \\left ( \\hat{a}_{\\vec{k}} e^{-i \\vec{k} \\cdot \\vec{x}} + \\hat{a}_{\\vec{k}}^\\dagger e^{i \\vec{k} \\cdot \\vec{x}} \\right)`,
        true
      )
    ).toBe(
      "$$\\hat{\\phi}(\\vec{x}, t) = \\int \\frac{d^3 k}{(2\\pi)^3} \\frac{1}{2 \\omega_{\\vec{k}}} \\left ( \\hat{a}_{\\vec{k}} e^{-i \\vec{k} \\cdot \\vec{x}} + \\hat{a}_{\\vec{k}}^\\dagger e^{i \\vec{k} \\cdot \\vec{x}} \\right)$$"
    );
  });

  it("块级公式带已有分隔符且多行，输出为单行", () => {
    expect(
      wrapAsMarkdownMath(
        `\\[
\\Delta \\sim \\mathcal O(1-10)
\\]`,
        true
      )
    ).toBe("$$\\Delta \\sim \\mathcal O(1-10)$$");
  });
});
