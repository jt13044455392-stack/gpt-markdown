/**
 * ChatGPT 页面适配器
 * 处理 ChatGPT 特定的 DOM 结构和选择器
 */

import { SiteAdapter } from "../site-adapter";

export class ChatGPTAdapter implements SiteAdapter {
  site: "chatgpt" = "chatgpt";

  /**
   * 找到 ChatGPT 的 assistant 回复容器
   * ChatGPT 使用 <section> 元素包装对话，通过 h4.sr-only 判断是否是 assistant 回复
   */
  findAssistantReplies(): HTMLElement[] {
    const results: HTMLElement[] = [];

    document.querySelectorAll("section").forEach((section) => {
      const h4 = section.querySelector("h4.sr-only");
      if (h4) {
        const text = h4.textContent ?? "";
        if (text.includes("ChatGPT") || text.includes("Assistant")) {
          results.push(section);
        }
      }
    });

    return results;
  }

  /**
   * 找到 ChatGPT 回复下方的操作按钮区域
   *
   * ChatGPT 的结构：
   *   section
   *     ├── div[class*="thread-content-max-width"]
   *     │   ├── div.flex.max-w-full     (回复内容)
   *     │   ├── div.justify-start       (操作栏) ← 这里
   *     │   └── div.pointer-events-none (分隔线)
   *     └── ...
   *
   * 优先级：
   *   1. 找 thread-content-max-width 容器内的 justify-start
   *   2. 找 [role="group"] 操作栏
   */
  findActionBar(replyElement: HTMLElement): HTMLElement | null {
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

    // 兜底：找 role=group 操作栏
    const actionBar = replyElement.querySelector(
      '[role="group"][aria-label*="消息操作"], [role="group"][aria-label*="message"]'
    ) as HTMLElement | null;

    return actionBar;
  }

  /**
   * 找到 ChatGPT 回复的内容部分
   *
   * 通过查找第一个 div 子元素来定位内容（在 section 之下）
   */
  findReplyContent(replyElement: HTMLElement): HTMLElement | null {
    for (const child of Array.from(replyElement.children) as HTMLElement[]) {
      if (child.tagName.toLowerCase() === "div") {
        return child;
      }
    }
    return null;
  }
}
