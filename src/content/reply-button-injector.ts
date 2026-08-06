import { convertReplyToMarkdown } from "./reply-to-markdown";
import { showToast } from "./toast";
import { getCurrentSiteAdapter, type SiteAdapter } from "./site-adapter";
import { captureNativeReplyMarkdown, normalizeChatGPTMarkdown } from "./chatgpt-native-copy";
import { safeCopyToClipboard } from "./clipboard-utils";

const BUTTON_ATTR = "data-ai-md-copy";

function showCopiedButtonState(button: HTMLButtonElement): void {
  const originalLabel = "复制为 Markdown";
  button.textContent = "已复制";
  button.disabled = true;
  window.setTimeout(() => {
    button.textContent = originalLabel;
    button.disabled = false;
  }, 1200);
}

function createCopyButton(
  section: HTMLElement,
  _initialContentEl: HTMLElement,
  adapter: SiteAdapter
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute(BUTTON_ATTR, "true");
  btn.className = "ai-md-copy-button";
  btn.textContent = "复制为 Markdown";

  btn.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    // 1. 动态实时查找当前 DOM 树中最新的回复内容容器
    const liveContentEl = adapter.findReplyContent(section) ?? section;

    // 先全量主动触发一次 TeX React Fiber 检索与 DOM 挂载
    if (typeof (window as any).scanAndAnnotateMathElements === "function") {
      (window as any).scanAndAnnotateMathElements(liveContentEl);
    }

    // 2. 毫秒级提取 DOM Markdown 并全量标准化
    const domMarkdown = convertReplyToMarkdown(liveContentEl);
    const initialMarkdown = normalizeChatGPTMarkdown(domMarkdown);

    let finalMarkdown = initialMarkdown;

    // 3. 立即尝试写入剪贴板，保住 User Activation 凭证
    if (initialMarkdown.trim()) {
      const success = await safeCopyToClipboard(initialMarkdown);
      if (success) {
        showCopiedButtonState(btn);
        showToast("已复制", { type: "success", x: event.clientX, y: event.clientY });
      }
    }

    // 4. 在后台静默请求 ChatGPT 最原生的 Markdown 载荷进行无缝覆盖升级
    if (adapter.site === "chatgpt") {
      captureNativeReplyMarkdown(section).then((nativeCopy) => {
        if ("markdown" in nativeCopy && nativeCopy.markdown.trim()) {
          const upgraded = normalizeChatGPTMarkdown(nativeCopy.markdown);
          if (upgraded && upgraded.trim().length > 0) {
            safeCopyToClipboard(upgraded);
          }
        }
      }).catch(() => {
        // 静默忽略
      });
    }
  });

  return btn;
}

function tryInjectToSection(section: HTMLElement, adapter: ReturnType<typeof getCurrentSiteAdapter>): void {
  // 检查是否已经注入过
  if (section.querySelector(`[${BUTTON_ATTR}]`)) return;

  const contentEl = adapter.findReplyContent(section);
  if (!contentEl) return;

  const btn = createCopyButton(section, contentEl, adapter);

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
