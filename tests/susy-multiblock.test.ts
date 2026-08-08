import { describe, it, expect } from "vitest";
import { normalizeChatGPTMarkdown } from "../src/content/chatgpt-native-copy";

describe("SUSY 完整多层结构文本：公式与标题不粘连", () => {
  it("$$formula$$\\n### 标题 不能粘成 $$formula$$### 标题（while循环不吃换行）", () => {
    const raw = `### 第一层：particle physics

$m_0,m_{1/2},A_0,\\tan\\beta,\\lambda_{\\rm RPV}$ \\rightarrow m_i. $$
通过 SoftSUSY 等得到 RPV-SUSY spectrum。

### 第二层：thermal history
$$ m_i \\rightarrow g_*,g_{*s},w(T). $$
识别 SUSY nonrelativistic transition 造成的
$$ w(T)<1/3. $$
### 第三层：PBH formation
$$ w(T) \\rightarrow \\Phi(w), \\delta_c(w,\\text{profile}), \\sigma_l, \\delta_{\\rm phys}, M_{\\rm PBH}, f(M). $$
这里已经包括：
* EoS-corrected transfer；
* profile-dependent threshold。`;

    const res = normalizeChatGPTMarkdown(raw);
    console.log("output:", JSON.stringify(res));

    // 公式必须正确
    expect(res).toContain("$$m_0,m_{1/2},A_0,\\tan\\beta,\\lambda_{\\rm RPV} \\rightarrow m_i.$$");
    expect(res).toContain("$$m_i \\rightarrow g_*,g_{*s},w(T).$$");
    expect(res).toContain("$$w(T)<1/3.$$");

    // 标题必须保留换行，绝不与上文粘连
    expect(res).not.toMatch(/\$\$### /);          // $$formula$$### 标题
    expect(res).not.toMatch(/spectrum。###/);      // 文字###标题
    expect(res).not.toMatch(/造成的\s*###/);       // 无换行直接接标题

    // 标题前至少有一个换行
    expect(res).toContain("\n### 第二层：thermal history");
    expect(res).toContain("\n### 第三层：PBH formation");
  });
});
