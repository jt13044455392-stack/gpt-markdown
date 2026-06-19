import { convertReplyToMarkdown } from "./reply-to-markdown";
import { showToast } from "./toast";

const BUTTON_ATTR = "data-cgpt-md-copy";
const ACTION_BAR_SELECTOR = '[role="group"][aria-label*="消息操作"], [role="group"][aria-label*="message"]';

function isAssistantSection(section: HTMLElement): boolean {
  const h4 = section.querySelector("h4.sr-only");
  if (!h4) return false;
  const text = h4.textContent ?? "";
  return text.includes("ChatGPT") || text.includes("Assistant");
}

function findContentElement(section: HTMLElement): HTMLElement | null {
  for (const child of Array.from(section.children) as HTMLElement[]) {
    if (child.tagName.toLowerCase() === "div") {
      return child;
    }
  }
  return null;
}

function createCopyButton(contentEl: HTMLElement): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute(BUTTON_ATTR, "true");
  btn.className = "cgpt-md-copy-button";
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

function tryInjectToSection(section: HTMLElement): void {
  if (!isAssistantSection(section)) return;
  if (section.querySelector(`[${BUTTON_ATTR}]`)) return;

  const contentEl = findContentElement(section);
  if (!contentEl) return;

  const btn = createCopyButton(contentEl);

  // 已确认的 assistant 回复结构：
  //   div[thread-content-max-width]
  //     ├── div.flex.max-w-full     (回复内容)
  //     ├── div.justify-start       (操作栏容器，图标在这里)  ← 按钮插这里
  //     └── div.pointer-events-none (分隔线)
  const threadContainer = section.querySelector('[class*="thread-content-max-width"]') as HTMLElement | null;
  if (threadContainer) {
    const actionBarContainer = Array.from(threadContainer.children).find(
      (c) => (c as HTMLElement).className?.includes("justify-start")
    ) as HTMLElement | undefined;

    if (actionBarContainer) {
      actionBarContainer.appendChild(btn);
      return;
    }
  }

  // 兜底1：找 role=group 操作栏，插在其后
  const actionBar = section.querySelector(ACTION_BAR_SELECTOR) as HTMLElement | null;
  if (actionBar) {
    actionBar.insertAdjacentElement("afterend", btn);
    return;
  }

  // 兜底2：section 末尾
  const wrapper = document.createElement("div");
  wrapper.className = "cgpt-md-copy-wrapper";
  wrapper.appendChild(btn);
  const srOnly = section.querySelector("span.sr-only");
  srOnly ? section.insertBefore(wrapper, srOnly) : section.appendChild(wrapper);
}

export function setupReplyMarkdownCopyButtons(): void {
  function scanAll() {
    document.querySelectorAll("section").forEach((el) => {
      tryInjectToSection(el as HTMLElement);
    });
  }

  scanAll();

  let attempts = 0;
  const poll = setInterval(() => {
    scanAll();
    attempts++;
    if (attempts >= 10) clearInterval(poll);
  }, 1000);

  const observer = new MutationObserver(() => {
    scanAll();
  });

  observer.observe(document.body, { childList: true, subtree: true });
}
