import { describe, it, expect } from "vitest";
import { wrapAsMarkdownMath } from "../src/content/markdown-wrapper";

describe("wrapAsMarkdownMath", () => {
  it("行内公式：无分隔符输入", () => {
    expect(wrapAsMarkdownMath("E=mc^2", false)).toBe("$E=mc^2$");
  });

  it("块级公式：无分隔符输入", () => {
    expect(wrapAsMarkdownMath("E=mc^2", true)).toBe("$$\nE=mc^2\n$$");
  });

  it("行内公式：输入已有 $ 分隔符，不重复包装", () => {
    expect(wrapAsMarkdownMath("$E=mc^2$", false)).toBe("$E=mc^2$");
  });

  it("块级公式：输入已有 $$ 分隔符，不重复包装", () => {
    expect(wrapAsMarkdownMath("$$E=mc^2$$", true)).toBe("$$\nE=mc^2\n$$");
  });

  it("行内公式：输入带 \\(...\\) 分隔符", () => {
    expect(wrapAsMarkdownMath("\\(a+b\\)", false)).toBe("$a+b$");
  });

  it("块级公式：输入带 \\[...\\] 分隔符", () => {
    expect(wrapAsMarkdownMath("\\[a+b\\]", true)).toBe("$$\na+b\n$$");
  });

  it("复杂公式行内", () => {
    expect(wrapAsMarkdownMath("\\frac{1}{2}", false)).toBe("$\\frac{1}{2}$");
  });

  it("复杂公式块级", () => {
    expect(wrapAsMarkdownMath("\\int_0^1 x^2 dx = \\frac{1}{3}", true)).toBe(
      "$$\n\\int_0^1 x^2 dx = \\frac{1}{3}\n$$"
    );
  });
});
