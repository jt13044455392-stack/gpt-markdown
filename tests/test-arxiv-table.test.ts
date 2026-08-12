import { describe, it, expect } from "vitest";
import { preSanitizeChatGPTText, compactMarkdownSpaces } from "../src/content/math-cleaner";
import { normalizeChatGPTMarkdown } from "../src/content/chatgpt-native-copy";

describe("测试用户真实 arXiv 引用与压扁表格恢复", () => {
  const rawInput = `($$arXiv][1]) 对我们而言，我会按下面优先级考虑。 | 候选机制                                        | $T\\sim$ TeV 是否自然 |  与 SUSY 联系 |  适合我们 | | - | -: | -: | -: | | **singlet 标量相变**                            |            ★★★★★ | 可扩展到 NMSSM | ★★★★★ | | **(U(1)_{B-L}/U(1)_X) breaking**            |            ★★★★★ |  有 SUSY 版本 | ★★★★★ | | **NMSSM singlet 多步相变**                      |              ★★★ |      ★★★★★ |  ★★★★ | | left-right (SU(2)_R) breaking               |              ★★★ |  有 SUSY 版本 |    ★★ | | confinement / radion / hidden strong sector |             ★★★★ |          弱 |    ★★ | ### 1. 我最推荐：TeV-scale singlet transition 最简单就是增加一个标量 (S)： [ V(H,S) = V_H(H) -\\frac{\\mu_S^2}{2}S^2 +\\frac{\\lambda_S}{4}S^4 +\\frac{\\lambda_{HS}}{2}|H|^2S^2 +\\cdots .$$`;

  it("必须将 ($$arXiv][1])、单行压扁表格和粘连标题完整恢复为规整的 Markdown 表格与小节", () => {
    const res = normalizeChatGPTMarkdown(rawInput);
    console.log("FINAL OUTPUT:\n" + res);

    // 1. arXiv 引用正确
    expect(res).toContain("([arXiv][1])");
    expect(res).not.toContain("($$arXiv");

    // 2. 表格各行独立成行（不是被压在一行）
    expect(res).toMatch(/\| 候选机制\s*\|.*\|\n\| -/);
    expect(res).toMatch(/\|\n\| \*\*singlet 标量相变\*\*/);
    expect(res).toMatch(/\|\n\| \*\*.*breaking\*\*/);
    expect(res).toMatch(/\|\n\| \*\*NMSSM singlet 多步相变\*\*/);
    expect(res).toMatch(/\|\n\| left-right/);
    expect(res).toMatch(/\|\n\| confinement/);

    // 3. 标题与正文独立成段
    expect(res).toMatch(/### 1\. 我最推荐：TeV-scale singlet transition\n+/);
    expect(res).toContain("最简单就是增加一个标量 $S$：");

    // 4. 公式正确转换为单行独立 display 公式
    expect(res).toContain("$$V(H,S) = V_H(H) -\\frac{\\mu_S^2}{2}S^2 +\\frac{\\lambda_S}{4}S^4 +\\frac{\\lambda_{HS}}{2}|H|^2S^2 +\\cdots$$");
  });
});
