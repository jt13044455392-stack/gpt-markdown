import { convertReplyToMarkdown } from "./reply-to-markdown";
import { showToast } from "./toast";
import { getCurrentSiteAdapter, type SiteAdapter } from "./site-adapter";
import { captureNativeReplyMarkdown, normalizeChatGPTMarkdown } from "./chatgpt-native-copy";
import { safeCopyToClipboard } from "./clipboard-utils";

const BUTTON_ATTR = "data-ai-md-copy";

const COPY_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
const CHECK_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10a37f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

function showCopiedButtonState(button: HTMLButtonElement): void {
  button.innerHTML = `${CHECK_ICON_SVG}<span>已复制</span>`;
  button.disabled = true;
  window.setTimeout(() => {
    button.innerHTML = `${COPY_ICON_SVG}<span>复制为 Markdown</span>`;
    button.disabled = false;
  }, 1500);
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
  btn.innerHTML = `${COPY_ICON_SVG}<span>复制为 Markdown</span>`;
  btn.title = "复制整条回复为干净的 Markdown 格式（含完整 LaTeX 公式）";

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

  // 优先尝试注入到操作栏
  const actionBar = adapter.findActionBar(section);
  if (actionBar) {
    const btn = createCopyButton(section, contentEl, adapter);
    actionBar.appendChild(btn);
    return;
  }

  // 兜底：插入到 turn 容器外层末尾（绝不可插入到 React 管理的 contentEl 内部，防止 React reconciliation 崩溃）
  const turnEl = section.closest("[data-testid^='conversation-turn-'], [class*='conversation-turn'], article, section") ?? section;
  if (turnEl && turnEl !== contentEl) {
    let wrapper = turnEl.querySelector(".ai-md-copy-wrapper") as HTMLElement | null;
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.className = "ai-md-copy-wrapper";
      turnEl.appendChild(wrapper);
    }
    if (!wrapper.querySelector(`[${BUTTON_ATTR}]`)) {
      const btn = createCopyButton(section, contentEl, adapter);
      wrapper.appendChild(btn);
    }
  }
}

export function setupReplyMarkdownCopyButtons(): void {
  const adapter = getCurrentSiteAdapter();

  if (adapter.site === "unknown") {
    console.warn("[GPT Markdown] Unknown site adapter, skipping reply button injection");
    return;
  }

  let isScanning = false;
  let scanScheduled = false;

  function scanAll() {
    try {
      const replies = adapter.findAssistantReplies();
      replies.forEach((section) => {
        tryInjectToSection(section, adapter);
      });
    } catch {
      // 安全忽略，绝不让异常影响页面
    }
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    const runner = () => {
      scanScheduled = false;
      if (isScanning) return;
      isScanning = true;
      try {
        scanAll();
      } finally {
        isScanning = false;
      }
    };

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(runner);
    } else {
      window.setTimeout(runner, 16);
    }
  }

  // 首次运行
  scanAll();

  // 监听 DOM 变化，带防抖地为新增回复注入按钮，绝不在微任务中密集阻塞主线程
  const observer = new MutationObserver(() => {
    scheduleScan();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
  });
}
