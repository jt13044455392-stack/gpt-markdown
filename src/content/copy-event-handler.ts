import { convertSelectionToMarkdown } from "./selection-to-markdown";
import { normalizeChatGPTMarkdown } from "./chatgpt-native-copy";

/**
 * 判断当前焦点是否在输入框 / 可编辑区域内。
 * 如果是，不干预复制行为。
 */
function isEditableTarget(event: ClipboardEvent): boolean {
  const target = event.target;
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea") return true;
  if (target.isContentEditable) return true;
  if (target.closest('[contenteditable="true"]')) return true;
  return false;
}

/**
 * 注册 copy 事件监听器。
 * 包含选区公式转换与原生文本自动规范化 double-check。
 */
export function setupCopyEventHandler(): void {
  document.addEventListener("copy", (event: ClipboardEvent) => {
    // 不干预输入框内的复制
    if (isEditableTarget(event)) return;

    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      const markdown = convertSelectionToMarkdown(selection);
      if (markdown) {
        event.preventDefault();
        const normalized = normalizeChatGPTMarkdown(markdown);
        event.clipboardData?.setData("text/plain", normalized);
        return;
      }
    }
  });
}
