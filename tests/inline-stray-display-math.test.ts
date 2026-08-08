import { describe, it, expect } from "vitest";
import { normalizeChatGPTMarkdown } from "../src/content/chatgpt-native-copy";
import { preSanitizeChatGPTText } from "../src/content/math-cleaner";

describe("调试：用户实际看到的破损 copy 文本", () => {
  it("诊断：$m_0,...$ \\rightarrow m_i. $$ 这段破损文本当前输出什么", () => {
    // 用户实际粘贴到 Obsidian 看到的就是这段破损文本（=插件处理后的 copy 结果）
    const rawFromClipboard = `## 第一层：particle physics

$m_0,m_{1/2},A_0,\\tan\\beta,\\lambda_{\\rm RPV}$ \\rightarrow m_i. $$
通过 SoftSUSY 等得到 RPV-SUSY spectrum。

### 第二层：thermal history
$$ m_i \\rightarrow g_*,g_{*s},w(T). $$
识别 SUSY nonrelativistic transition 造成的
$$
w(T)<1/3.
$$`;

    const prePre = preSanitizeChatGPTText(rawFromClipboard);
    console.log("preSanitize:", JSON.stringify(prePre));

    const res = normalizeChatGPTMarkdown(rawFromClipboard);
    console.log("final:", JSON.stringify(res));

    // 期望：合并回正确的 display math
    expect(res).toContain("$$m_0,m_{1/2},A_0,\\tan\\beta,\\lambda_{\\rm RPV} \\rightarrow m_i.$$");
    expect(res).toContain("$$m_i \\rightarrow g_*,g_{*s},w(T).$$");
    expect(res).toContain("$$w(T)<1/3.$$");
  });
});
