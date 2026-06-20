import { convertReplyToMarkdown } from "./reply-to-markdown";
import { showToast } from "./toast";
import { getCurrentSiteAdapter } from "./site-adapter";

const BUTTON_ATTR = "data-ai-md-copy";

function createCopyButton(contentEl: HTMLElement): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute(BUTTON_ATTR, "true");
  btn.className = "ai-md-copy-button";
  btn.textContent = "复制为 Markdown";

  btn.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const markdown = convertReplyToMarkdown(contentEl);
    if (!markdown.trim()) {
      showToast("复制失败", { type: "error", x: event.clientX, y: event.clientY });
      return;
    }

    try {
      await navigator.clipboard.writeText(markdown);
      showToast("已复制", { type: "success", x: event.clientX, y: event.clientY });
    } catch {
      showToast("复制失败", { type: "error", x: event.clientX, y: event.clientY });
    }
  });

  return btn;
}

function tryInjectToSection(section: HTMLElement, adapter: ReturnType<typeof getCurrentSiteAdapter>): void {
  // 检查是否已经注入过
  if (section.querySelector(`[${BUTTON_ATTR}]`)) return;

  const contentEl = adapter.findReplyContent(section);
  if (!contentEl) return;

  const btn = createCopyButton(contentEl);

  // 优先尝试注入到操作栏
  const actionBar = adapter.findActionBar(section);
  if (actionBar) {
    actionBar.appendChild(btn);
    return;
  }

  // 兜底：插入到回复内容末尾
  const wrapper = document.createElement("div");
  wrapper.className = "ai-md-copy-wrapper";
  wrapper.appendChild(btn);
  contentEl.appendChild(wrapper);
}

export function setupReplyMarkdownCopyButtons(): void {
  const adapter = getCurrentSiteAdapter();

  if (adapter.site === "unknown") {
    console.warn("[GPT Markdown] Unknown site adapter, skipping reply button injection");
    return;
  }

  function scanAll() {
    const replies = adapter.findAssistantReplies();
    replies.forEach((section) => {
      tryInjectToSection(section, adapter);
    });
  }

  scanAll();

  // 监听 DOM 变化，自动为新增的回复注入按钮
  const observer = new MutationObserver(() => {
    scanAll();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
  });
}
