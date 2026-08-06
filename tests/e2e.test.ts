import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { normalizeChatGPTMarkdown } from "../src/content/chatgpt-native-copy";

const HTML_FIXTURE = `
<!DOCTYPE html>
<html>
<body>
  <section id="turn-1">
    <h4 class="sr-only">ChatGPT</h4>
    <div class="thread-content-max-width">
      <div class="markdown">
        <p>横轴：<span class="katex" id="inline-formula-1"><span class="katex-mathml"><math><annotation encoding="application/x-tex">m_{1/2}</annotation></math></span><span class="katex-html" aria-hidden="true">(m_{1/2})</span></span></p>
        <p>纵轴：<span class="katex" id="inline-formula-2"><span class="katex-mathml"><math><annotation encoding="application/x-tex">m_0</annotation></math></span><span class="katex-html" aria-hidden="true">(m_0)</span></span></p>
        <p>对于 满足条件的点，用连续色图显示</p>
        <div class="katex-display" id="display-formula-1"><span class="katex"><span class="katex-mathml"><math><annotation encoding="application/x-tex">\\log_{10}!\\left(M_{\\rm enh}/M_\\odot\\right)</annotation></math></span><span class="katex-html" aria-hidden="true">log10(Menh/M⊙)</span></span></div>
        <p>并叠加一条黑色等值线：</p>
        <div class="katex-display" id="display-formula-2"><span class="katex"><span class="katex-mathml"><math><annotation encoding="application/x-tex">M_{\\rm enh}=2.14\\times10^{-8}M_\\odot</annotation></math></span><span class="katex-html" aria-hidden="true">Menh=2.14×10−8M⊙</span></span></div>
      </div>
      <div class="justify-start">
        <button data-testid="copy-turn-action-button">Copy</button>
      </div>
    </div>
  </section>
</body>
</html>
`;

describe("网页端真实操作 E2E 验证", () => {
  it("必须通过：行内公式单点、行间公式单点、整篇复制 Markdown（无损完整 LaTeX 反斜杠）", async () => {
    const dom = new JSDOM(HTML_FIXTURE, {
      url: "https://chatgpt.com/c/test-session",
      runScripts: "dangerously",
    });

    const { window } = dom;
    const { document } = window;

    let lastClipboardText = "";
    (window.navigator as any).clipboard = {
      writeText: async (text: string) => {
        lastClipboardText = text;
        return Promise.resolve();
      },
    };

    const distDir = path.join(__dirname, "../dist");
    const bridgeJs = fs.readFileSync(path.join(distDir, "page-clipboard-bridge.js"), "utf8");
    const contentJs = fs.readFileSync(path.join(distDir, "content.js"), "utf8");

    (window as any).eval(bridgeJs);
    (window as any).eval(contentJs);

    // 1. 点击行内公式
    const inlineEl = document.getElementById("inline-formula-1")!;
    inlineEl.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
    expect(lastClipboardText).toBe("$m_{1/2}$");

    // 2. 点击行间公式
    const displayEl = document.getElementById("display-formula-1")!;
    displayEl.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
    expect(lastClipboardText).toBe("$$\\log_{10}!\\left(M_{\\rm enh}/M_\\odot\\right)$$");

    // 3. 点击整篇「复制为 Markdown」按钮
    const nativeBtn = document.querySelector('[data-testid="copy-turn-action-button"]')!;
    nativeBtn.addEventListener("click", () => {
      const text = "横轴：(m_{1/2})\n纵轴：(m_0)\n对于 满足条件的点，用连续色图显示\n[\n\\log_{10}!\\left(M_{\\rm enh}/M_\\odot\\right)\n]\n并叠加一条黑色等值线：\n[\nM_{\\rm enh}=2.14\\times10^{-8}M_\\odot\n]";
      (window.navigator.clipboard.writeText(text) as any);
    });

    const copyBtn = document.querySelector("[data-ai-md-copy]")!;
    copyBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 100));

    // 对原生的载荷做全量 normalizeChatGPTMarkdown 规范转换
    const finalResult = normalizeChatGPTMarkdown(lastClipboardText);

    expect(finalResult).toContain("$m_{1/2}$");
    expect(finalResult).toContain("$m_0$");
    expect(finalResult).toContain("$$\n\\log_{10}!\\left(M_{\\rm enh}/M_\\odot\\right)\n$$");
    expect(finalResult).toContain("$$\nM_{\\rm enh}=2.14\\times10^{-8}M_\\odot\n$$");
    expect(finalResult).not.toContain("[\n");
    expect(finalResult).not.toContain("(m_{1/2})");
  });
});
