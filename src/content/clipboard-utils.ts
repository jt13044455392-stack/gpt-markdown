/**
 * 安全且可靠的剪贴板写入工具库
 * 兼顾现代 Clipboard API 与经典 document.execCommand('copy') 兜底
 */
export async function safeCopyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. 同步 execCommand('copy') 优先（在用户原生点击手势下 100% 同步执行，无权限延迟）
  if (typeof document !== "undefined" && typeof document.execCommand === "function") {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      textarea.style.left = "-9999px";
      textarea.style.opacity = "0";
      textarea.style.pointerEvents = "none";
      textarea.setAttribute("readonly", "true");

      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, text.length);

      const successful = document.execCommand("copy");
      document.body.removeChild(textarea);

      if (successful) return true;
    } catch {
      // 降级到 Async API
    }
  }

  // 2. 尝试现代 Async Clipboard API
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn("[GPT Markdown] navigator.clipboard.writeText failed:", err);
    }
  }

  return false;
}
