import { extractLatex } from "./latex-extractor";
import { wrapAsMarkdownMath } from "./markdown-wrapper";

/**
 * 判断一个元素是否是需要整体输出 Markdown 公式的数学节点。
 * 命中后直接输出公式，跳过其所有子节点，避免 KaTeX 内部重复文本。
 *
 * 故意不用 node.matches() —— 在 content script isolated world 里，
 * cloneContents() 克隆出的节点调用 matches() 可能返回 false。
 * 改用直接检查 className / tagName，更可靠。
 */
const MATH_CLASS_PATTERNS = [
  "katex-display",  // 顺序重要：先匹配更外层的
  "katex",
  "math-block",
  "math-inline",
  "katex-mathml",
] as const;

function isMathElement(node: Node): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false;
  const cls = node.className ?? "";
  const tag = node.tagName.toLowerCase();
  if (MATH_CLASS_PATTERNS.some((p) => cls.includes(p))) return true;
  if (tag === "mjx-container") return true;
  if (tag === "math") return true;
  if (node.hasAttribute("data-math")) return true;
  return false;
}

/**
 * 判断块级公式。
 * 只检查元素自身，不用 closest()——克隆节点没有父节点链。
 */
function isDisplayMath(el: HTMLElement): boolean {
  const cls = el.className ?? "";
  if (cls.includes("katex-display")) return true;
  if (cls.includes("math-block")) return true;
  if (el.tagName.toLowerCase() === "mjx-container" && el.getAttribute("display") === "true") return true;
  return false;
}

/**
 * 块级容器标签：遇到这些标签在输出中补充换行。
 */
const BLOCK_TAGS = new Set([
  "p", "div", "section", "article", "blockquote",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "li", "tr", "pre",
]);

/**
 * 代码块标签：内部不做公式转换，直接取文本。
 */
const CODE_TAGS = new Set(["pre", "code"]);

/**
 * 递归遍历 DOM 节点，输出 Markdown 文本。
 *
 * 规则：
 * - 遇到 aria-hidden="true" 节点 → 跳过（KaTeX 渲染层，避免重复）
 * - 遇到公式节点 → 直接输出 $...$ 或 $$...$$，跳过子节点
 * - 遇到代码节点 → 直接取 textContent，跳过子节点
 * - 遇到 <br>     → 输出换行
 * - 遇到块级容器 → 输出内容后补一个换行
 * - 遇到文本节点 → 直接输出文本
 */
function walkNode(node: Node): string {
  // 文本节点
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (!(node instanceof HTMLElement)) return "";

  // 跳过 aria-hidden 节点（KaTeX 的 .katex-html 渲染层带有此属性）
  // 这样就不会把渲染出的可见文字重复输出一遍
  if (node.getAttribute("aria-hidden") === "true") return "";

  const tag = node.tagName.toLowerCase();

  // 代码块：直接取纯文本，不转换公式
  if (CODE_TAGS.has(tag)) {
    return node.textContent ?? "";
  }

  // <br>：换行
  if (tag === "br") {
    return "\n";
  }

  // 公式节点：直接输出 Markdown，跳过子节点
  // .katex 同时包含 .katex-mathml（有 LaTeX 源码）和 .katex-html（aria-hidden，已被上面跳过）
  // 所以这里能安全提取 annotation 里的 LaTeX，不会重复
  if (isMathElement(node)) {
    const latex = extractLatex(node);
    if (!latex) {
      // 提取失败：只输出 .katex-mathml 里的纯文本（MathML 的可读文本），跳过渲染层
      const mathml = node.querySelector(".katex-mathml, math");
      return mathml?.textContent?.trim() ?? node.textContent?.trim() ?? "";
    }
    const isDisplay = isDisplayMath(node);
    const md = wrapAsMarkdownMath(latex, isDisplay);
    // 块级公式前后加换行，避免和周围文字挤在一起
    return isDisplay ? `\n${md}\n` : md;
  }

  // 普通容器：递归子节点
  let result = "";
  for (const child of node.childNodes) {
    result += walkNode(child);
  }

  // 块级标签后加换行
  if (BLOCK_TAGS.has(tag)) {
    result = result.trimEnd() + "\n";
  }

  return result;
}

/**
 * 把一个 HTMLElement 或 DocumentFragment 转换为 Markdown 文本。
 * 重点处理公式，其余内容尽量保留原始文本。
 */
export function convertElementToMarkdown(root: HTMLElement | DocumentFragment): string {
  let result = "";
  for (const child of root.childNodes) {
    result += walkNode(child);
  }
  // 清理多余的连续空行（超过两个换行压缩为两个）
  return result.replace(/\n{3,}/g, "\n\n").trim();
}
