import { describe, it, expect } from "vitest";
import { normalizeChatGPTMarkdown } from "../src/content/chatgpt-native-copy";

describe("测试用户最新 prompt：boxed 括号脱落与多余 } ] 符号修复", () => {
  const rawInput = `所以状态方程变化的第一个作用就是
$$\\boxed{ w,c_s^2 \\rightarrow \\Phi_k(\\eta)\\text{ 的振荡、相位和衰减改变}$$
}
]
$$\\boxed{ w(T),c_s^2(T) \\rightarrow \\Phi_k \\rightarrow G_k \\rightarrow I \\rightarrow \\Omega_{\\rm GW}$$
}
]`;

  it("必须将脱落到下一行的 } 和 ] 修复并闭合到 \\boxed 内部", () => {
    const res = normalizeChatGPTMarkdown(rawInput);
    console.log("FORMATTED:\n" + res);

    expect(res).not.toContain("$$\n}\n]");
    expect(res).not.toContain("$$\n}");
    expect(res).not.toContain("$$\n]");
    expect(res).toContain("$$\\boxed{ w,c_s^2 \\rightarrow \\Phi_k(\\eta)\\text{ 的振荡、相位和衰减改变} }$$");
    expect(res).toContain("$$\\boxed{ w(T),c_s^2(T) \\rightarrow \\Phi_k \\rightarrow G_k \\rightarrow I \\rightarrow \\Omega_{\\rm GW} }$$");
  });
});
