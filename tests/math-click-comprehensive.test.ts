import { describe, it, expect, vi, beforeEach } from "vitest";
import { findMathElement } from "../src/content/math-detector";
import { extractLatex } from "../src/content/latex-extractor";
import { wrapAsMarkdownMath } from "../src/content/markdown-wrapper";

describe("测试公式点击提取与各结构兼容性", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("点击 SVG 或复杂子节点（如根号、分数线）能正确查找到最外层公式并提取 LaTeX", () => {
    document.body.innerHTML = `
      <div class="katex-display">
        <span class="katex">
          <span class="katex-mathml">
            <math xmlns="http://www.w3.org/1998/Math/MathML">
              <semantics>
                <mrow><msqrt><mi>x</mi></msqrt></mrow>
                <annotation encoding="application/x-tex">\\sqrt{x}</annotation>
              </semantics>
            </math>
          </span>
          <span class="katex-html" aria-hidden="true">
            <span class="base">
              <span class="mord sqrt">
                <span class="svg-align">
                  <svg id="svg-node"><path id="svg-path" d="M123"></path></svg>
                </span>
              </span>
            </span>
          </span>
        </span>
      </div>
    `;

    const svgPath = document.getElementById("svg-path")!;
    const match = findMathElement(svgPath);

    expect(match).not.toBeNull();
    expect(match?.isDisplay).toBe(true);

    const latex = extractLatex(match?.element);
    expect(latex).toBe("\\sqrt{x}");

    const md = wrapAsMarkdownMath(latex!, match!.isDisplay);
    expect(md).toBe("$$\\sqrt{x}$$");
  });

  it("点击不含反斜杠的简短变量公式（如 S、x=1、Z=1）必须 100% 正确提取", () => {
    document.body.innerHTML = `
      <span class="katex" id="simple-math">
        <span class="katex-mathml">
          <math xmlns="http://www.w3.org/1998/Math/MathML">
            <semantics>
              <mrow><mi>S</mi></mrow>
              <annotation encoding="application/x-tex">S</annotation>
            </semantics>
          </math>
        </span>
        <span class="katex-html"><span class="mord mathnormal">S</span></span>
      </span>
    `;

    const span = document.getElementById("simple-math")!;
    const match = findMathElement(span);

    expect(match).not.toBeNull();
    expect(match?.isDisplay).toBe(false);

    const latex = extractLatex(match?.element);
    expect(latex).toBe("S");

    const md = wrapAsMarkdownMath(latex!, match!.isDisplay);
    expect(md).toBe("$S$");
  });
});
