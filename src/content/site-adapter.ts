/**
 * 站点适配层：根据当前网站选择不同的适配逻辑
 * 支持 ChatGPT 和 Claude
 */

import { ChatGPTAdapter } from "./adapters/chatgpt-adapter";
import { ClaudeAdapter } from "./adapters/claude-adapter";

export type SupportedSite = "chatgpt" | "claude" | "unknown";

export interface SiteAdapter {
  site: SupportedSite;

  /**
   * 找到页面中所有的 assistant 回复容器（最粗粒度的 section）
   */
  findAssistantReplies(): HTMLElement[];

  /**
   * 找到某条回复下方的操作按钮区域
   * @param replyElement 由 findAssistantReplies 返回的 section 元素
   * @returns 操作栏元素，如果找不到则返回 null
   */
  findActionBar(replyElement: HTMLElement): HTMLElement | null;

  /**
   * 找到回复的内容部分（用于提取 Markdown）
   * @param replyElement 由 findAssistantReplies 返回的 section 元素
   * @returns 内容元素，如果找不到则返回 null
   */
  findReplyContent(replyElement: HTMLElement): HTMLElement | null;
}

const chatgptAdapter = new ChatGPTAdapter();
const claudeAdapter = new ClaudeAdapter();

/**
 * 获取当前网站的适配器
 */
export function getCurrentSiteAdapter(): SiteAdapter {
  const hostname = window.location.hostname;

  if (hostname.includes("chatgpt.com") || hostname.includes("chat.openai.com")) {
    return chatgptAdapter;
  }

  if (hostname.includes("claude.ai")) {
    return claudeAdapter;
  }

  console.warn("[GPT Markdown] Unknown site:", hostname);
  return {
    site: "unknown",
    findAssistantReplies: () => [],
    findActionBar: () => null,
    findReplyContent: () => null,
  };
}
