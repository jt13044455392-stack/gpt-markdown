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

  it("绝对不能将 \\left[ 和 \\right] 拆碎成 \\right$$ 也不留孤立脱落的 ] 括号", () => {
    const rawInputProblem3 = `$$ds^2=a^2(\\tau) \\left[ -(1+2\\Phi)d\\tau^2 + (\\delta_{ij}-2\\Psi\\delta_{ij}+2h_{ij})dx^idx^j \\right$$.
]

$$h_\\lambda(x) = x^{-\\beta} \\left[ \\tilde C_1J_\\beta(x)+ \\tilde C_2Y_\\beta(x) \\right$$,
]`;

    const normalized3 = normalizeChatGPTMarkdown(rawInputProblem3);
    expect(normalized3).not.includes("\\right$$");
    expect(normalized3).not.includes("]\n]");
    expect(normalized3).toContain("ds^2=a^2");
    expect(normalized3).toContain("h_\\lambda(x)");
  });

  it("必须完整保留带有 \\boxed{...} 和 \\right]^2 的四组复杂宇宙学微扰与积分公式", () => {
    const rawComplexFormulas = `$$\\boxed{ \\mathcal P_h(k,\\tau) = 2 \\int_0^\\infty dv \\int_{|1-v|}^{1+v}du, \\left[ \\frac{ 4v^2-(1+v^2-u^2)^2 }{ 4uv } \\right$$ ^2
\\mathcal P_{\\mathcal R}(kv)
\\mathcal P_{\\mathcal R}(ku)
I^2(u,v,x)
}
]

$$\\boxed{ \\overline{I_{\\rm KD}^2} = \\frac{9}{16\\pi u^4v^4x} \\left[ \\frac{ \\left( 3(u^2+v^2-1)^2-4u^2v^2 \\right)^2 }{ 4u^2v^2-(u^2+v^2-1)^2 } + 9(u^2+v^2-1)^2 \\right$$.
}
]`;

    const res = normalizeChatGPTMarkdown(rawComplexFormulas);
    expect(res).not.includes("\\right$$");
    expect(res).not.includes("]\n");
    expect(res).toContain("\\boxed{");
    expect(res).toContain("\\mathcal P_h(k,\\tau)");
    expect(res).toContain("\\overline{I_{\\rm KD}^2}");
    expect(res).toContain("\\right]^2");
  });

  it("必须将脱落反斜杠的 \\left{ 和 \\right} 自动修复为 Obsidian 和 KaTeX 可渲染的 \\left\\{ 和 \\right\\}", () => {
    const rawCurly = `$$\\overline{I_{\\rm RD}^2} = \\frac{ 9(u^2+v^2-3)^2 }{ 32u^6v^6x^2 } \\left{ \\pi^2 (u^2+v^2-3)^2 \\Theta(u+v-\\sqrt3) + \\left[ -4uv+ (u^2+v^2-3) \\ln\\left| \\frac{3-(u+v)^2} {3-(u-v)^2} \\right| \\right]^2 \\right},$$`;
    const resCurly = normalizeChatGPTMarkdown(rawCurly);
    expect(resCurly).toContain("\\left\\{");
    expect(resCurly).toContain("\\right\\}");
    expect(resCurly).not.includes("\\left{");
  });

  it("绝不能允许 $$ 跨越 Markdown 标题和多个列表项误吞正文，且精准修复脱落子公式", () => {
    const rawLongText = ` $$k\\tau\\gg1; ] * reheating 被处理成**瞬时转换**； * 只考虑 perfect fluid； * 假设 primordial curvature perturbation 是 **Gaussian**； * 没有计算 primordial non-Gaussianity 对 SIGW/PBH 的影响； * PBH collapse threshold 在 (w\\simeq1) 下仍有很大的理论不确定性； * 应用部分使用 [ \\delta\\text{-function} ] 尖峰功率谱，主要是为了展示解析结构，并不是一个现实的 inflation power spectrum； * 作者也没有解决二阶张量扰动的 gauge-dependence 问题。  - # 23. 对我们现在研究最有价值的地方 如果把这篇文章和你前面看的 **2301.12750** 区分开，会非常清楚： [ \\boxed{ \\text{2301.12750： 通胀模型} \\rightarrow \\mathcal P_\\zeta(k) \\rightarrow PBH/SIGW }$$`;
    const resLong = normalizeChatGPTMarkdown(rawLongText);
    expect(resLong).toContain("$k\\tau\\gg1$");
    expect(resLong).toContain("$w\\simeq1$");
    expect(resLong).toContain("$\\delta\\text{-function}$");
    expect(resLong).toContain("$$\\boxed{ \\text{2301.12750： 通胀模型} \\rightarrow \\mathcal P_\\zeta(k) \\rightarrow PBH/SIGW }$$");
    expect(resLong).toContain("# 23. 对我们现在研究最有价值的地方");
    expect(resLong).toContain("* 只考虑 perfect fluid；");
  });

  it("必须压减多余空行，并将被换行分割的短变量公式无缝融合进正文", () => {
    const rawSparseText = `假如你固定某个 PBH abundance,

$$f_{\\rm PBH},$$

radiation domination 和 kinetic domination 可以通过适当调节

$$A_{\\mathcal R}$$

得到差不多的 PBH 丰度。

但对应的

$$\\Omega_{\\rm GW}(f)$$`;

    const res = normalizeChatGPTMarkdown(rawSparseText);
    expect(res).not.includes("\n\n$$f_{\\rm PBH},$$\n\n");
    expect(res).toContain("abundance,\n$$f_{\\rm PBH},$$\nradiation");
    expect(res).not.includes("\n\n\n");
  });
});
