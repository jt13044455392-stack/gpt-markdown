/**
 * ChatGPT 页面适配器
 * 处理 ChatGPT 特定的 DOM 结构和选择器
 */

import { SiteAdapter } from "../site-adapter";

export class ChatGPTAdapter implements SiteAdapter {
  site: "chatgpt" = "chatgpt";

  /**
   * 找到 ChatGPT 的 assistant 回复容器
   * 严格限定在主要聊天区域内，绝不匹配侧边栏、历史记录列表或顶部导航
   */
  findAssistantReplies(): HTMLElement[] {
    const results: HTMLElement[] = [];
    const set = new Set<HTMLElement>();

    function isInsideSidebar(el: Element): boolean {
      return el.closest("nav, aside, [data-testid*='sidebar'], [id*='sidebar'], header, dialog, form") !== null;
    }

    // 1. 核心数据属性匹配：由 [data-message-author-role="assistant"] 向上定位 turn 容器
    document.querySelectorAll('[data-message-author-role="assistant"]').forEach((el) => {
      if (isInsideSidebar(el)) return;
      const turn = (el.closest("article, [data-testid^='conversation-turn-'], [class*='conversation-turn'], section") ?? el) as HTMLElement;
      if (!set.has(turn) && !isInsideSidebar(turn)) {
        set.add(turn);
        results.push(turn);
      }
    });

    // 2. 查找 main / 聊天区中的 conversation-turn / article / section 容器
    const mainContainer = document.querySelector("main, [role='main']") ?? document.body;
    mainContainer.querySelectorAll("article, [data-testid^='conversation-turn-'], [class*='conversation-turn'], section").forEach((sec) => {
      const el = sec as HTMLElement;
      if (set.has(el) || isInsideSidebar(el)) return;
      const h4 = el.querySelector("h4.sr-only, .sr-only");
      const h4Text = h4?.textContent ?? "";
      if (h4Text.includes("ChatGPT") || h4Text.includes("Assistant") || h4Text.includes("GPT")) {
        set.add(el);
        results.push(el);
      } else if (el.querySelector('[data-message-author-role="assistant"], .markdown, [class*="markdown"]')) {
        // 确保排除纯用户提问 turn
        if (!el.querySelector('[data-message-author-role="user"]') || el.querySelector('[data-message-author-role="assistant"]')) {
          set.add(el);
          results.push(el);
        }
      }
    });

    return results;
  }

  /**
   * 找到 ChatGPT 回复下方的操作按钮区域
   * 优先插入到原生复制按钮的父容器中，兜底支持多种操作栏结构
   */
  findActionBar(replyElement: HTMLElement): HTMLElement | null {
    // 1. 优先在自身及父级 turn 中查找原生复制按钮的父容器
    const turnEl = replyElement.closest("[data-testid^='conversation-turn-'], [class*='conversation-turn'], article, section") ?? replyElement;
    const nativeCopyBtn = turnEl.querySelector(
      'button[data-testid="copy-turn-action-button"], button[data-testid*="copy"], button[aria-label*="Copy"], button[aria-label*="复制"], button[aria-label*="copy"]'
    );
    if (nativeCopyBtn && nativeCopyBtn.parentElement) {
      return nativeCopyBtn.parentElement;
    }

    // 2. 查找包裹操作栏的 group 或 flex 容器
    const group = turnEl.querySelector(
      '[role="group"], [aria-label*="操作"], [aria-label*="actions"], [aria-label*="message"]'
    ) as HTMLElement | null;
    if (group) return group;

    const threadContainer = turnEl.querySelector(
      '[class*="thread-content-max-width"]'
    ) as HTMLElement | null;

    if (threadContainer) {
      const justifyStart = Array.from(threadContainer.children).find((c) =>
        (c as HTMLElement).className?.includes("justify-start") || (c as HTMLElement).className?.includes("flex-row")
      ) as HTMLElement | undefined;

      if (justifyStart) {
        return justifyStart;
      }
    }

    return null;
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
