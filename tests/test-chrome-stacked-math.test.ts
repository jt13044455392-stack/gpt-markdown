import { describe, it, expect } from "vitest";
import { preSanitizeChatGPTText, compactMarkdownSpaces } from "../src/content/math-cleaner";
import { normalizeChatGPTMarkdown } from "../src/content/chatgpt-native-copy";

describe("测试 Chrome 下复杂长文：多重 $$ 堆叠、行内 display 降级与标点连接", () => {
  const rawInput = `$$$$$$
$$$$\\boxed{ Z(k)\\equiv \\frac{\\mathcal P_T(\\eta_{\\rm hc},k)} {\\mathcal P_T(\\eta_{\\rm hc},k_{\\rm high})} }$$$$
也就是：不同频率的模式在视界重入附近产生的 induced tensor power，相对于一个很高频、已经处于近似纯 RD $w\\simeq1/3$ 区域的结果。论文在 Fig.4 和 Eq.(23) 就是这样定义的。

### 1. 先看蓝线

灰色虚线
$$ Z=1 $$代表理想的
$$ w=c_s^2=\\frac 13 $$基准。

所以蓝线很好理解：
$$ Z(k)<1 $$表示真实 SM 热历史让这个频率的 SIGW **相对于纯 RD 被压低**；
$$ Z(k)>1 $$表示 **被增强**。

例如图里最低大约
$$ Z\\simeq 0.88, $$即 tensor power 大约降低 (12%)；随后最高大约
$$ Z\\simeq 1.07, $$即增强约 (7%)。

这里比较的是 $\\mathcal P_T(\\eta_{\\rm hc})$，不是最终今天的 $\\Omega_{\\rm GW,0}$。

---

### 2. 为什么蓝线会有这些凹凸？

因为 SM 热历史中
$$ g_*(T),g_{*s}(T) $$发生变化，导致
$$ w(T),\\qquad c_s^2(T) $$偏离 $1/3$。

论文 Fig.1 就显示了两个主要结构：
$$ \\text{QCD transition} $$和
$$ \\text{electroweak transition}. $$它们进一步影响
$$ a(\\eta),\\qquad \\Phi_k(\\eta),\\qquad G_k(\\eta,\\tilde\\eta), $$所以改变
$$ I(u,v,k) = \\int d\\tilde\\eta, \\frac{a(\\tilde\\eta)}{a(\\eta)} G_k f[\\Phi,w]. $$也就是说：
$$$$$$
$$$$ \\boxed{ g_*,g_{*s} \\rightarrow w,c_s^2 \\rightarrow \\Phi,G \\rightarrow \\mathcal P_T \\rightarrow Z(k) } $$$$
作者明确说，Fig.4 的形状来自 $a$、source $f$ 和 Green function 的**共同作用和延迟效应**，因此没有一个简单解析公式；它只是大致跟 $d w/dT$ 的结构相关。

---`;

  it("必须将多重 $$ 堆叠彻底消除，并将句子中嵌入的短 display 公式降级为自然流利的行内公式", () => {
    const res = normalizeChatGPTMarkdown(rawInput);
    console.log("FINAL CLEAN RES:\n" + res);

    // 1. 不存在任何 $$$$ 或多重 $$ 堆叠
    expect(res).not.toMatch(/\${3,}/);
    expect(res).not.toMatch(/(?:^|\n)\s*\$\$\s*\$\$/);
    expect(res).not.toMatch(/^\$\s*\\boxed/); // 绝不能输出单个 $\boxed

    // 2. 顶层与底层的大 Boxed 公式必须完整保留为块级公式
    expect(res).toContain("$$\\boxed{ Z(k)\\equiv \\frac{\\mathcal P_T(\\eta_{\\rm hc},k)} {\\mathcal P_T(\\eta_{\\rm hc},k_{\\rm high})} }$$");
    expect(res).toContain("$$\\boxed{ g_*,g_{*s} \\rightarrow w,c_s^2 \\rightarrow \\Phi,G \\rightarrow \\mathcal P_T \\rightarrow Z(k) }$$");

    // 3. 积分大公式必须保留为块级公式
    expect(res).toContain("$$I(u,v,k) = \\int d\\tilde\\eta, \\frac{a(\\tilde\\eta)}{a(\\eta)} G_k f[\\Phi,w].$$");

    // 4. 句子中嵌入的短公式必须还原为连贯的行内文本
    expect(res).toContain("灰色虚线 $Z=1$ 代表理想的 $w=c_s^2=\\frac 13$ 基准。");
    expect(res).toContain("$Z(k)<1$ 表示真实 SM 热历史");
    expect(res).toContain("$Z(k)>1$ 表示 **被增强**。");
    expect(res).toContain("最低大约 $Z\\simeq 0.88$");
    expect(res).toContain("最高大约 $Z\\simeq 1.07$");
    expect(res).toContain("热历史中 $g_*(T),g_{*s}(T)$ 发生变化，导致 $w(T),\\qquad c_s^2(T)$ 偏离 $1/3$。");
    expect(res).toContain("$\\text{QCD transition}$ 和 $\\text{electroweak transition}$");

    // 5. 百分比数字清洗
    expect(res).toContain("12%");
    expect(res).toContain("7%");
    expect(res).not.toContain("(12%)");
    expect(res).not.toContain("(7%)");
  });
});
