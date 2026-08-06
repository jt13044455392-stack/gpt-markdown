/**
 * ChatGPT 页面适配器
 * 处理 ChatGPT 特定的 DOM 结构和选择器
 */

import { SiteAdapter } from "../site-adapter";

export class ChatGPTAdapter implements SiteAdapter {
  site: "chatgpt" = "chatgpt";

  /**
   * 找到 ChatGPT 的 assistant 回复容器
   * 优先使用 ChatGPT 的核心数据属性 [data-message-author-role="assistant"]
   */
  findAssistantReplies(): HTMLElement[] {
    const results: HTMLElement[] = [];
    const set = new Set<HTMLElement>();

    // 1. 核心属性查找
    document.querySelectorAll('[data-message-author-role="assistant"]').forEach((el) => {
      const section = (el.closest("section, article") ?? el) as HTMLElement;
      if (!set.has(section)) {
        set.add(section);
        results.push(section);
      }
    });

    // 2. 兜底传统 section + sr-only 查找
    document.querySelectorAll("section, article").forEach((sec) => {
      const el = sec as HTMLElement;
      if (set.has(el)) return;
      const h4 = el.querySelector("h4.sr-only, .sr-only");
      if (h4) {
        const text = h4.textContent ?? "";
        if (text.includes("ChatGPT") || text.includes("Assistant") || text.includes("GPT")) {
          set.add(el);
          results.push(el);
        }
      } else if (el.querySelector(".markdown, [class*='markdown']")) {
        set.add(el);
        results.push(el);
      }
    });

    return results;
  }

  /**
   * 找到 ChatGPT 回复下方的操作按钮区域
   * 优先插入到原生复制按钮 [data-testid="copy-turn-action-button"] 的父容器中
   */
  findActionBar(replyElement: HTMLElement): HTMLElement | null {
    const nativeCopyBtn = replyElement.querySelector(
      'button[data-testid="copy-turn-action-button"], button[aria-label*="Copy"], button[aria-label*="复制"]'
    );
    if (nativeCopyBtn && nativeCopyBtn.parentElement) {
      return nativeCopyBtn.parentElement;
    }

    const threadContainer = replyElement.querySelector(
      '[class*="thread-content-max-width"]'
    ) as HTMLElement | null;

    if (threadContainer) {
      const justifyStart = Array.from(threadContainer.children).find((c) =>
        (c as HTMLElement).className?.includes("justify-start")
      ) as HTMLElement | undefined;

      if (justifyStart) {
        return justifyStart;
      }
    }

    return replyElement.querySelector(
      '[role="group"][aria-label*="消息操作"], [role="group"][aria-label*="message"]'
    );
  }

  /**
   * 找到 ChatGPT 回复的内容部分
   */
  findReplyContent(replyElement: HTMLElement): HTMLElement | null {
    const markdown = replyElement.querySelector(".markdown, [class*='markdown']") as HTMLElement | null;
    if (markdown) return markdown;

    if (replyElement.getAttribute("data-message-author-role") === "assistant") {
      return replyElement;
    }

    for (const child of Array.from(replyElement.children) as HTMLElement[]) {
      if (child.tagName.toLowerCase() === "div") {
        return child;
      }
    }
    return replyElement;
  }
}
