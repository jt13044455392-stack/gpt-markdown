import { describe, it, expect } from "vitest";
import { normalizeChatGPTMarkdown } from "../src/content/chatgpt-native-copy";
import { preSanitizeChatGPTText } from "../src/content/math-cleaner";

describe("测试用户最新文献与标量方程 Prompt - 验证修复效果", () => {
  const raw = `($$arXiv][1]) * * **Abe, Tada & Ueda, arXiv:2010.06193, JCAP 2021**。它以 QCD/EW 热史为例，直接用 (g_*,g_{*s}) 构造随时间变化的 $w(T),\\qquad c_s^2(T),$ 然后数值求 $\\Phi_k(\\eta)$ 和张量 Green function，再计算完整 SIGW。作者特别强调：SIGW 不只对 (w) 敏感，对 (c_s^2) 也敏感，因为后者直接改变标量扰动的声学振荡。([arXiv][2]) 这第二篇的标量方程特别值得我们直接借鉴： [ \\Phi_k'' +3\\mathcal H(1+c_s^2)\\Phi_k' + \\left[ c_s^2 k^2 +3\\mathcal H^2(c_s^2-w) \\right]\\Phi_k =0,$$
这里我省略了利用背景方程化简前的等价写法。它清楚说明为什么不能只知道

$w(T)$

就结束了：真实热等离子体一般有
$$\\boxed{c_s^2(T)\\neq w(T)}$$.

2010.06193 就是专门计算这个效应的。($$arXiv][2]) 后面还有几篇沿着“transition 必须真正计算”的方向发展： * * **2311.12340**：系统研究 EMD(\\to)RD 从慢 transition 到快 transition，发现 transition 速度可以让 SIGW 从强烈压低连续变成共振式增强。这说明 transition 的具体时间形状不能忽略。([arXiv][3]) * * **2410.17291**：进一步做更完整的数值处理，包括 EMD 的开始和结束，以及 matter/radiation 之间的相对速度扰动；作者明确说其数值框架也可用于其他非标准宇宙热史。([arXiv][4]) * * **2512.04482**：很新的工作，直接推导适用于一般 reheating 动力学的 SIGW source，允许标量场平滑转化成辐射，并讨论多种流体自由度和二阶 gauge invariance。它指出，在 horizon re-entry 后，不同标量自由度会出现独立动力学，因此简单用一个 $\\Phi$ 或一个有效 (w) 有时不够。([arXiv][5]) - ### 对我们来说，最大的难点是什么？ 我认为**第一难点不是 SIGW 的二维 (u,v) 积分，而是正确得到标量 transfer function** $$ \\boxed{\\Phi_k(\\eta)} $$. 因为我们的真正链条是 [ g_*(T),g_{*s}(T) \\rightarrow w(T),c_s^2(T) \\rightarrow a(\\eta),\\mathcal H(\\eta) \\rightarrow \\Phi_k(\\eta) \\rightarrow S_{\\rm GW} \\rightarrow \\Omega_{\\rm GW}.`;

  it("必须正确格式化所有列表项、公式、标题与引用链接", () => {
    const res = normalizeChatGPTMarkdown(raw);
    console.log("FORMATTED OUTPUT:\n" + res);

    // 1. 引用链接修复
    expect(res).toContain("([arXiv][1])");
    expect(res).toContain("([arXiv][2])");
    expect(res).not.toContain("($$arXiv");

    // 2. 列表项换行与消重
    expect(res).not.toMatch(/(?:^|\n)\s*\*\s+\*\s+/); // 不允许 * * 重复 bullet
    expect(res).toContain("* **Abe, Tada & Ueda");
    expect(res).toContain("* **2311.12340**");
    expect(res).toContain("* **2410.17291**");
    expect(res).toContain("* **2512.04482**");

    // 3. 标量微分方程必须是完整块级公式，不能被 \\right 截断
    expect(res).toContain("$$\\Phi_k'' +3\\mathcal H(1+c_s^2)\\Phi_k' + \\left[ c_s^2 k^2 +3\\mathcal H^2(c_s^2-w) \\right]\\Phi_k =0$$");
    expect(res).not.toContain("\\right$$\\Phi_k");

    // 4. 标题必须有独立换行，且脱落的列表横杠不能粘连在标题前
    expect(res).toContain("\n\n### 对我们来说，最大的难点是什么？\n\n我认为**第一难点不是");
    expect(res).not.toMatch(/[^\n]###/);
    expect(res).not.toContain("- ###");

    // 5. 行内数学变量修复
    expect(res).toContain("$g_*,g_{*s}$");
    expect(res).toContain("$w$");
    expect(res).toContain("$c_s^2$");
    expect(res).toContain("EMD($\\to$)RD");
    expect(res).toContain("$u,v$");

    // 6. 末尾长链公式转换为块级公式
    expect(res).toContain("$$g_*(T),g_{*s}(T) \\rightarrow w(T),c_s^2(T) \\rightarrow a(\\eta),\\mathcal H(\\eta) \\rightarrow \\Phi_k(\\eta) \\rightarrow S_{\\rm GW} \\rightarrow \\Omega_{\\rm GW}$$");
    expect(res).not.toContain("g_*$T$");
  });
});
