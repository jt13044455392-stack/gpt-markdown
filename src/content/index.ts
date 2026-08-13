import { findMathElement } from "./math-detector";
import { extractLatex } from "./latex-extractor";
import { wrapAsMarkdownMath } from "./markdown-wrapper";
import { showToast } from "./toast";
import { setupCopyEventHandler } from "./copy-event-handler";
import { setupReplyMarkdownCopyButtons } from "./reply-button-injector";
import { safeCopyToClipboard } from "./clipboard-utils";
import "./styles.css";

console.log("[GPT Markdown] content script loaded");

// ── 场景 A：手动选中内容后按 Ctrl+C 复制（含公式时自动转换）────────────────
setupCopyEventHandler();

// ── 场景 B：点击「复制为 Markdown」按钮复制整条回复 ───────────────────────
setupReplyMarkdownCopyButtons();

// ── 场景 C：点击单个公式复制为 $...$ / $$...$$ 格式 ────────────────────────
document.addEventListener(
  "click",
  async (event) => {
    try {
      const target = event.target;
      if (!(target instanceof Element)) return;

      // 绝不拦截侧边栏、历史记录列表、导航链接、对话框、常规按钮或输入控件
      if (target.closest("nav, aside, [data-testid*='sidebar'], [id*='sidebar'], header, dialog, form, a, button, input, textarea")) {
        return;
      }

      // 如果点的是插件自己注入的按钮，不处理（按钮有专属 listener）
      if (target.closest("[data-ai-md-copy]")) return;

      const match = findMathElement(target);
      if (!match) return;

      let latex = extractLatex(match.element) ?? extractLatex(target);
      let isDisplay = match.isDisplay;

      // 如果当前节点或父容器上未提取到，尝试从 MathML 中的 annotation 或 math alttext 获取
      if (!latex) {
        const container = (match.element.closest(".katex, .katex-display, .math-display, .math-inline, .math-block, [data-math], mjx-container, math, [class*='katex'], [class*='math']") ?? match.element) as Element;
        const ann = container.querySelector("annotation") ?? match.element.querySelector("annotation");
        const annText = ann?.textContent?.trim();
        if (annText && annText.length > 0) {
          latex = annText;
        } else {
          const mathTag = container.tagName.toLowerCase() === "math" ? container : (container.querySelector("math") ?? match.element.querySelector("math"));
          const altText = mathTag?.getAttribute("alttext")?.trim();
          if (altText && altText.length > 0) {
            latex = altText;
          }
        }
      }

      // 如果依然没提取到但明确命中了公式节点，尝试获取文本内容作为兜底
      if (!latex) {
        const rawText = match.element.textContent?.trim();
        if (rawText && rawText.length > 0 && rawText.length < 300) {
          latex = rawText;
        }
      }

      if (!latex) {
        showToast("未定位到 LaTeX 源码", { type: "error", x: event.clientX, y: event.clientY });
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const markdown = wrapAsMarkdownMath(latex, isDisplay);

      // 立即使用 safeCopyToClipboard 写入剪贴板（避免 User Activation 凭证失效）
      const success = await safeCopyToClipboard(markdown);
      if (success) {
        showToast("已复制", { type: "success", x: event.clientX, y: event.clientY });
      } else {
        showToast("复制失败", { type: "error", x: event.clientX, y: event.clientY });
      }
    } catch {
      // 安全忽略
    }
  },
  true
);
