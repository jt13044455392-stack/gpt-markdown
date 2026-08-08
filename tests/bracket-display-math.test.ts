import { describe, it, expect } from "vitest";
import { normalizeChatGPTMarkdown } from "../src/content/chatgpt-native-copy";

describe("[ 变量开头含\\command ] 的 display math 处理 & 多级标题不被误拆", () => {
  it("必须将 [ m_0,...\\rightarrow m_i. ] 转换为 $$...$$ 且 ## 标题不被拆成 #\\n\\n# 标题", () => {
    const raw = `## 第一层：particle physics

[ m_0,m_{1/2},A_0,\\tan\\beta,\\lambda_{\\rm RPV} \\rightarrow m_i. ]
通过 SoftSUSY 等得到 RPV-SUSY spectrum。

### 第二层：thermal history
[ m_i \\rightarrow g_*,g_{*s},w(T). ]
识别 SUSY nonrelativistic transition 造成的
[ w(T)<1/3. ]
后面全都有问题。`;

    const res = normalizeChatGPTMarkdown(raw);

    // 公式必须正确转换为块级 $$...$$
    expect(res).toContain("$$m_0,m_{1/2},A_0,\\tan\\beta,\\lambda_{\\rm RPV} \\rightarrow m_i.$$");
    expect(res).toContain("$$m_i \\rightarrow g_*,g_{*s},w(T).$$");
    expect(res).toContain("$$w(T)<1/3.$$");

    // ## 不能被误拆为 # + # 标题
    expect(res).toContain("## 第一层：particle physics");
    expect(res).not.toContain("#\n\n# 第一层");

    // ### 不能被误拆
    expect(res).toContain("### 第二层：thermal history");
    expect(res).not.toContain("##\n\n# 第二层");

    // 不应产生截断碎片（如 $m_0...$ \rightarrow 孤立在外）
    expect(res).not.toMatch(/\$m_0,.*?\$ \\rightarrow/);
    expect(res).not.toMatch(/\$m_i\$ \\rightarrow/);
  });
});
