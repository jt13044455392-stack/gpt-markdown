/**
 * 安全且可靠的剪贴板写入工具库
 * 兼顾现代 Clipboard API 与经典 document.execCommand('copy') 兜底
 */
export async function safeCopyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 尝试现代 Async Clipboard API
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn("[GPT Markdown] navigator.clipboard.writeText failed, fallback to execCommand:", err);
    }
  }

  // 经典 execCommand('copy') 降级方案（100% 同步手势可靠）
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    textarea.setAttribute("readonly", "true");

    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);

    const successful = document.execCommand("copy");
    document.body.removeChild(textarea);

    if (successful) return true;
  } catch (err) {
    console.error("[GPT Markdown] execCommand copy failed:", err);
  }

  return false;
}
