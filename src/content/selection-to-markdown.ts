import { convertElementToMarkdown } from "./dom-to-markdown";

/**
 * 用 TreeWalker 遍历 fragment，判断是否包含公式节点。
 * 避免用 querySelector（在 content script isolated world 里
 * 对 cloneContents() 产生的节点可能无法正常工作）。
 */
const MATH_CLASS_PATTERNS = [
  "katex",
  "katex-display",
  "math-inline",
  "math-block",
  "katex-mathml",
];

function nodeContainsMath(root: DocumentFragment): boolean {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    if (node instanceof HTMLElement) {
      const cls = node.className ?? "";
      const tag = node.tagName.toLowerCase();
      // class 包含公式关键词
      if (MATH_CLASS_PATTERNS.some((p) => cls.includes(p))) return true;
      // MathJax 容器
      if (tag === "mjx-container") return true;
      // MathML
      if (tag === "math") return true;
      // data-math 属性
      if (node.hasAttribute("data-math")) return true;
    }
    node = walker.nextNode();
  }
  return false;
}

/**
 * 把当前 Selection 转换为 Markdown 文本。
 *
 * 如果选区中没有公式，返回 null（不干预默认复制）。
 * 如果有公式，返回转换后的完整 Markdown 字符串。
 */
export function convertSelectionToMarkdown(selection: Selection): string | null {
  if (selection.rangeCount === 0 || selection.isCollapsed) return null;

  // 把所有 range 合并到一个 fragment
  const container = document.createDocumentFragment();
  for (let i = 0; i < selection.rangeCount; i++) {
    container.appendChild(selection.getRangeAt(i).cloneContents());
  }

  // 只有选区确实包含公式时才干预
  if (!nodeContainsMath(container)) return null;

  return convertElementToMarkdown(container);
}
