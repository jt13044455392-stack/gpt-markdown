import { convertElementToMarkdown } from "./dom-to-markdown";
import { showToast } from "./toast";

/**
 * 判断一个元素是否是 ChatGPT 的"复制消息"按钮。
 *
 * 优先用 data-testid（当前已确认），同时保留语义兜底，
 * 应对 ChatGPT 未来改动 testid 的情况。
 */
function isCopyReplyButton(el: HTMLElement): boolean {
  const btn = el.closest("button") as HTMLElement | null;
  const target = btn ?? el;

  // 最稳定：data-testid
  if (target.getAttribute("data-testid") === "copy-turn-action-button") return true;

  // 语义兜底：aria-label / title 包含复制关键词
  const ariaLabel = (target.getAttribute("aria-label") ?? "").toLowerCase();
  const title = (target.getAttribute("title") ?? "").toLowerCase();
  const COPY_KEYWORDS = ["copy", "复制", "复制消息", "复制回复"];
  const matches = (s: string) => COPY_KEYWORDS.some((k) => s.includes(k));

  return matches(ariaLabel) || matches(title);
}

/**
 * 从复制按钮找到对应的 assistant 回复内容容器。
 *
 * 已确认的结构（2025年6月）：
 *   button
 *     → div (操作按钮组 role=group)
 *       → div (z-0 flex justify-end)
 *         → div[data-conversation-screenshot-content] (单条消息块)
 *           → div (thread-content)
 *             → section (整条 turn，包含用户消息 + assistant 回复)
 *
 * section 往上5层是 section，section 内包含用户消息和 assistant 回复两部分。
 * 我们取 section 内第一个含 .katex 的子树，或者取整个 section 内容
 * 但排除用户消息部分（用户消息通常在 items-end / user-message 容器里）。
 */
function findReplyContainer(btn: HTMLElement): HTMLElement | null {
  // 优先：往上找 section（已确认存在于第5层祖先）
  const section = btn.closest("section") as HTMLElement | null;
  if (section) {
    // section 内可能同时有用户消息和 assistant 回复
    // 用户消息通常在 class 含 "items-end" 或 "user-" 的容器里
    // 找 section 内不是用户消息的最大内容块
    const assistantContent = findAssistantContent(section);
    if (assistantContent) return assistantContent;
    // 找不到就返回整个 section（保底）
    return section;
  }

  // 兜底：找含公式的最近祖先
  let el: HTMLElement | null = btn;
  for (let i = 0; i < 10; i++) {
    el = el.parentElement;
    if (!el) break;
    if (el.querySelector(".katex")) return el;
  }

  return null;
}

/**
 * 在 section 内找 assistant 回复的内容节点，排除用户消息部分。
 */
function findAssistantContent(section: HTMLElement): HTMLElement | null {
  // ChatGPT 用户消息通常在带 items-end 的容器（靠右对齐）
  // assistant 回复在不带 items-end 的容器（靠左）
  const children = Array.from(section.children) as HTMLElement[];

  for (const child of children) {
    const cls = child.className ?? "";
    // 跳过用户消息容器
    if (cls.includes("items-end") || cls.includes("user-")) continue;
    // 找含有公式或文本内容的块
    if (child.querySelector(".katex") || (child.textContent?.trim().length ?? 0) > 20) {
      return child;
    }
  }

  return null;
}

/**
 * 注册对 ChatGPT 自带"复制消息"按钮的监听。
 * 捕获阶段拦截，转换公式后写入剪贴板。
 * 任何步骤失败都静默放行，不影响页面正常功能。
 */
export function setupReplyCopyButtonHandler(): void {
  document.addEventListener(
    "click",
    async (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!isCopyReplyButton(target)) return;

      const btn = (target.closest("button") as HTMLElement | null) ?? target;
      const container = findReplyContainer(btn);
      if (!container) return;

      // 只有当回复里确实有公式时才接管，否则让 ChatGPT 自己处理
      if (!container.querySelector(".katex, mjx-container, [data-math]")) return;

      const markdown = convertElementToMarkdown(container);
      if (!markdown) return;

      try {
        event.preventDefault();
        event.stopPropagation();
        await navigator.clipboard.writeText(markdown);
        showToast("已复制", { type: "success", x: event.clientX, y: event.clientY });
      } catch {
        // 静默失败，让 ChatGPT 原有行为继续
      }
    },
    true
  );
}
