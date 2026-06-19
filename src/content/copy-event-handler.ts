import { convertSelectionToMarkdown } from "./selection-to-markdown";

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
 *
 * 只有当选区中包含公式时，才拦截默认复制并写入 Markdown 格式。
 * 其余情况（无公式、输入框内、代码块）一律放行。
 */
export function setupCopyEventHandler(): void {
  document.addEventListener("copy", (event: ClipboardEvent) => {
    // 不干预输入框内的复制
    if (isEditableTarget(event)) return;

    const selection = window.getSelection();
    if (!selection) return;

    const markdown = convertSelectionToMarkdown(selection);

    // 没有公式，放行
    if (!markdown) return;

    event.preventDefault();
    event.clipboardData?.setData("text/plain", markdown);
  });
  // 注意：这里不用捕获阶段（true），用冒泡阶段
  // 捕获阶段会和 index.ts 里的点击监听器冲突
}
