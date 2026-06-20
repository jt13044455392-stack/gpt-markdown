import { findMathElement } from "./math-detector";
import { extractLatex } from "./latex-extractor";
import { wrapAsMarkdownMath } from "./markdown-wrapper";
import { showToast } from "./toast";
import { setupCopyEventHandler } from "./copy-event-handler";
import { setupReplyMarkdownCopyButtons } from "./reply-button-injector";
import "./styles.css";

console.log("[GPT Markdown] content script loaded");

// ── 场景 A：手动选中内容后按 Ctrl+C 复制（含公式时自动转换）────────────────
setupCopyEventHandler();

// ── 场景 B：点击「复制为 Markdown」按钮复制整条回复 ───────────────────────
setupReplyMarkdownCopyButtons();

// ── 场景 C：点击单个公式复制为 $...$ 格式 ────────────────────────────────
document.addEventListener(
  "click",
  async (event) => {
    // 如果点的是插件自己注入的按钮，不处理（按钮自己有 listener）
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("[data-ai-md-copy]")) return;

    const match = findMathElement(event.target);
    if (!match) return;

    event.preventDefault();
    event.stopPropagation();

    const latex = extractLatex(match.element);
    if (!latex) {
      showToast("未找到可复制的公式", { type: "error", x: event.clientX, y: event.clientY });
      return;
    }

    const markdown = wrapAsMarkdownMath(latex, match.isDisplay);

    try {
      await navigator.clipboard.writeText(markdown);
      showToast("已复制", { type: "success", x: event.clientX, y: event.clientY });
    } catch (error) {
      console.error("[GPT Markdown] Clipboard write failed:", error);
      showToast("复制失败", { type: "error", x: event.clientX, y: event.clientY });
    }
  },
  true
);
