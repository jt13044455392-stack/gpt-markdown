import { describe, expect, it } from "vitest";
import {
  extractMarkdownMathExpressions,
  findChatGPTReply,
  findNativeCopyButton,
  findRenderedFormulaIndex,
  normalizeChatGPTMarkdown,
} from "../src/content/chatgpt-native-copy";

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  const reply = document.querySelector("section");
  if (!(reply instanceof HTMLElement)) throw new Error("Reply fixture not found");
  return reply;
}

describe("extractMarkdownMathExpressions", () => {
  it("extracts ChatGPT inline and display TeX in document order", () => {
    const markdown = [
      "令 \\(x^2\\) 为行内公式。",
      "",
      "\\[",
      "\\frac{1}{2}",
      "\\]",
      "",
      "再看 \\(\\alpha+\\beta\\)。",
    ].join("\n");

    expect(extractMarkdownMathExpressions(markdown)).toEqual([
      { latex: "x^2", isDisplay: false },
      { latex: "\\frac{1}{2}", isDisplay: true },
      { latex: "\\alpha+\\beta", isDisplay: false },
    ]);
  });

  it("extracts backslash-parenthesized inline math", () => {
    const markdown = "行内公式是 \\(E=mc^2\\)。";
    expect(extractMarkdownMathExpressions(markdown)).toEqual([
      { latex: "E=mc^2", isDisplay: false },
    ]);
  });

  it("extracts single-dollar inline math", () => {
    const markdown = "能量公式是 $E=mc^2$，价格是 $5。";
    expect(extractMarkdownMathExpressions(markdown)).toEqual([
      { latex: "E=mc^2", isDisplay: false },
    ]);
  });

  it("extracts bare parenthesized inline TeX from ChatGPT copy", () => {
    const markdown = "总丰度取 (f_{\\rm tot}=1)，平均质量为 (\\langle M\\rangle)。";
    expect(extractMarkdownMathExpressions(markdown)).toEqual([
      { latex: "f_{\\rm tot}=1", isDisplay: false },
      { latex: "\\langle M\\rangle", isDisplay: false },
    ]);
  });

  it("supports ChatGPT payloads with bare line-delimited display brackets", () => {
    const markdown = "[\nE = mc^2\n]";
    expect(extractMarkdownMathExpressions(markdown)).toEqual([
      { latex: "E = mc^2", isDisplay: true },
    ]);
  });

  it("extracts inline math with commas, symbols, and multiletter expressions", () => {
    const markdown = "变量包含 $a, b$，集合 $x \\in X$ 以及公式 $f(x) = x+1$。";
    expect(extractMarkdownMathExpressions(markdown)).toEqual([
      { latex: "a, b", isDisplay: false },
      { latex: "x \\in X", isDisplay: false },
      { latex: "f(x) = x+1", isDisplay: false },
    ]);
  });

  it("extracts begin-end environment display formulas", () => {
    const markdown = [
      "方程组如下：",
      "\\begin{align}",
      "a &= b + c \\\\",
      "d &= e",
      "\\end{align}",
    ].join("\n");

    expect(extractMarkdownMathExpressions(markdown)).toEqual([
      { latex: "\\begin{align}\na &= b + c \\\\\nd &= e\n\\end{align}", isDisplay: true },
    ]);
  });

  it("extracts math codeblocks as display formulas", () => {
    const markdown = [
      "```math",
      "\\int_0^1 x^2 dx = \\frac{1}{3}",
      "```",
    ].join("\n");

    expect(extractMarkdownMathExpressions(markdown)).toEqual([
      { latex: "\\int_0^1 x^2 dx = \\frac{1}{3}", isDisplay: true },
    ]);
  });

  it("ignores TeX-looking examples inside non-math fenced code", () => {
    const markdown = [
      "```tex",
      "\\[not a rendered formula\\]",
      "```",
      "真实公式：\\(x+y\\)",
    ].join("\n");

    expect(extractMarkdownMathExpressions(markdown)).toEqual([
      { latex: "x+y", isDisplay: false },
    ]);
  });
});

describe("normalizeChatGPTMarkdown", () => {
  it("converts ChatGPT's stripped delimiters to standard Markdown math", () => {
    const markdown = [
      "总丰度取 (f_{\\rm tot}=1)。",
      "[",
      "\\langle M\\rangle = \\frac{f_{\\rm tot}}{n}",
      "]",
    ].join("\n");

    expect(normalizeChatGPTMarkdown(markdown)).toBe([
      "总丰度取 $f_{\\rm tot}=1$。",
      "$$\\langle M\\rangle = \\frac{f_{\\rm tot}}{n}$$",
    ].join("\n"));
  });

  it("normalizes inline formulas with commas and align environments properly", () => {
    const markdown = "设 $a, b$ 为常数，且 \\(x \\in X\\)。";
    expect(normalizeChatGPTMarkdown(markdown)).toBe("设 $a, b$ 为常数，且 $x \\in X$。");
  });

  it("应该正确规范化用户真实的 ChatGPT 带括号与块级公式的纯文本载荷", () => {
    const input = `横轴：(m_{1/2})
纵轴：(m_0)
对于 满足条件的点，用连续色图显示
[
\\log_{10}!\\left(M_{\\rm enh}/M_\\odot\\right)
]
并叠加一条黑色等值线：
[
M_{\\rm enh}=2.14\\times10^{-8}M_\\odot
]`;

    const result = normalizeChatGPTMarkdown(input);
    expect(result).toContain("$m_{1/2}$");
    expect(result).toContain("$m_0$");
    expect(result).toContain("$$\\log_{10}!\\left(M_{\\rm enh}/M_\\odot\\right)$$");
    expect(result).toContain("$$M_{\\rm enh}=2.14\\times10^{-8}M_\\odot$$");
  });

  it("normalizes real-world ChatGPT payload with [ ... ] and ( ... ) formulas", () => {
    const raw = [
      "横轴：(m_{1/2})",
      "对于 满足条件的点，用连续色图显示",
      "[",
      "\\log_{10}!\\left(M_{\\rm enh}/M_\\odot\\right)",
      "]",
      "切片：((A_0,\\tan\\beta))",
    ].join("\n");

    const expected = [
      "横轴：$m_{1/2}$",
      "对于 满足条件的点，用连续色图显示",
      "$$\\log_{10}!\\left(M_{\\rm enh}/M_\\odot\\right)$$",
      "切片：$A_0,\\tan\\beta$",
    ].join("\n");

    expect(normalizeChatGPTMarkdown(raw)).toBe(expected);
  });
});

describe("findChatGPTReply", () => {
  it("prefers the outer assistant section when sections are nested", () => {
    const reply = mount(`
      <section id="outer"><h4 class="sr-only">ChatGPT</h4>
        <section id="inner"><h4 class="sr-only">ChatGPT</h4>
          <span class="katex"><span id="formula">x</span></span>
        </section>
      </section>
    `);
    const formula = document.getElementById("formula");

    expect(findChatGPTReply(formula!)).toBe(reply);
  });
});

describe("findNativeCopyButton", () => {
  it("finds an action bar button mounted in the surrounding message turn", () => {
    const reply = mount(`
      <div data-conversation-screenshot-content>
        <section><p>Reply</p></section>
        <div><button data-testid="copy-turn-action-button">Copy</button></div>
      </div>
    `);

    expect(findNativeCopyButton(reply)?.dataset.testid).toBe("copy-turn-action-button");
  });

  it("finds copy button using aria-label fallback", () => {
    const reply = mount(`
      <section>
        <p>Reply</p>
        <div><button aria-label="复制消息">Copy</button></div>
      </section>
    `);

    expect(findNativeCopyButton(reply)?.getAttribute("aria-label")).toBe("复制消息");
  });
});

describe("findRenderedFormulaIndex", () => {
  it("maps an inner rendered KaTeX node to its position in the reply", () => {
    const reply = mount(`
      <section>
        <p><span class="katex"><span class="katex-html"><span id="first">a</span></span></span></p>
        <div class="katex-display"><span class="katex"><span class="katex-html"><span id="second">b</span></span></span></div>
      </section>
    `);
    const first = document.getElementById("first");
    const second = document.getElementById("second");

    expect(first).toBeInstanceOf(HTMLElement);
    expect(second).toBeInstanceOf(HTMLElement);
    expect(findRenderedFormulaIndex(reply, first!, false)).toBe(0);
    expect(findRenderedFormulaIndex(reply, second!, true)).toBe(0);
  });

  it("keeps inline and display indexes independent in mixed replies", () => {
    const reply = mount(`
      <section>
        <p><span class="katex"><span id="inline-a">a</span></span></p>
        <div class="katex-display"><span class="katex"><span id="display-a">b</span></span></div>
        <p><span class="katex"><span id="inline-b">c</span></span></p>
        <div class="katex-display"><span class="katex"><span id="display-b">d</span></span></div>
      </section>
    `);
    const inlineB = document.getElementById("inline-b");
    const displayB = document.getElementById("display-b");

    expect(findRenderedFormulaIndex(reply, inlineB!, false)).toBe(1);
    expect(findRenderedFormulaIndex(reply, displayB!, true)).toBe(1);
  });
});
