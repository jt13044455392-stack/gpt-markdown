import { describe, it, expect } from "vitest";
import { normalizeChatGPTMarkdown } from "../src/content/chatgpt-native-copy";

describe("用户真实 Prompt 文本提取规范化测试", () => {
  it("必须将用户长文 Prompt 中所有 (m_{1/2}), (A_0) 和 [ \\log_{10}... ] 正确转换为 Obsidian Markdown", () => {
    const rawInput = `可以，下面这种写法比较适合直接发给 AI（尤其是让它帮你改 matplotlib 代码时）。

---

## 你可以直接这样描述

**请把我现在的单面板参数图（类似第二张图）扩展成一个多面板扫描图（类似第一张图），并且不要改变任何物理判据和限制分类逻辑。**

### 已有基础

我现在已经有一张单面板图，内容是：

* 横轴：(m_{1/2})
* 纵轴：(m_0)
* 对于 **满足条件的点**，用连续色图显示
  [
  \\log_{10}!\\left(M_{\\rm enh}/M_\\odot\\right)
  ]
* 对于 **被 collider constraints 排除的点**，用固定的紫色填充
* 并叠加一条黑色等值线：
  [
  M_{\\rm enh}=2.14\\times10^{-8}M_\\odot
  ]

### 现在想要的目标

请在**不改变现有所有限制条件、分类规则、颜色规则和判定顺序**的前提下，把这张单面板图扩展为一个 **5 行 (\\times) 6 列** 的多面板图：

* **行方向对应 (A_0)**：
  [
  A_0={-4000,,-1000,,0,,2000,,4000}\\ {\\rm GeV}
  ]
* **列方向对应 (\\tan\\beta)**：
  [
  \\tan\\beta={5,,15,,25,,35,,45,,55}
  ]

每个子图都表示一个固定的 ((A_0,\\tan\\beta)) 切片，在 ((m_{1/2},m_0)) 平面上作图。`;

    const normalized = normalizeChatGPTMarkdown(rawInput);

    // 校验 1：行内公式转换为 $m_{1/2}$ 和 $m_0$
    expect(normalized).includes("$m_{1/2}$");
    expect(normalized).includes("$m_0$");
    expect(normalized).includes("$A_0$");
    expect(normalized).includes("$\\tan\\beta$");

    // 校验 2：块级公式转换为单行 $$...$$，包含反斜杠
    expect(normalized).includes("$$\\log_{10}!\\left(M_{\\rm enh}/M_\\odot\\right)$$");
    expect(normalized).includes("$$M_{\\rm enh}=2.14\\times10^{-8}M_\\odot$$");
    expect(normalized).includes("$$A_0={-4000,,-1000,,0,,2000,,4000}\\ {\\rm GeV}$$");

    // 校验 3：包含完整的带反斜杠 LaTeX 指令
    expect(normalized).toMatch(/\\log_\{10\}/);
    expect(normalized).not.toMatch(/(?<!\\)log_\{10\}/);
  });

  it("必须消除公式中出现的 Setext Heading 分隔符 (===) 并且输出单行块级公式", () => {
    const rawInputProblem1 = `$$
\\mathcal H\\equiv\\frac{a'}a
==========================

\\frac{2}{(1+3w)\\tau}.
$$`;
    const normalized1 = normalizeChatGPTMarkdown(rawInputProblem1);
    expect(normalized1).not.includes("============");
    expect(normalized1).toBe("$$\\mathcal H\\equiv\\frac{a'}a = \\frac{2}{(1+3w)\\tau}.$$");
  });

  it("必须正确处理复杂嵌套括号 LaTeX 公式，不破坏渲染", () => {
    const rawInputProblem2 = `$$
\\overline{I_{\\rm RD}^2}
=======================

\\frac{
9(u^2+v^2-3)^2
}{
32u^6v^6x^2
}
\\left[
\\pi^2
(u^2+v^2-3)^2
\\Theta(u+v-\\sqrt3)
+
\\left[
-4uv+
(u^2+v^2-3)
\\ln\\left|
\\frac{3-(u+v)^2}
{3-(u-v)^2}
\\right|
\\right]
^2
\\right]
$$`;
    const normalized2 = normalizeChatGPTMarkdown(rawInputProblem2);
    expect(normalized2).not.includes("=======");
    expect(normalized2.startsWith("$$")).toBe(true);
    expect(normalized2.endsWith("$$")).toBe(true);
    expect(normalized2).includes("\\overline{I_{\\rm RD}^2}");
    expect(normalized2).includes("\\Theta(u+v-\\sqrt3)");
    expect(normalized2).not.includes("\n");
  });
});
