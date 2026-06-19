import { extractLatex, stripMathDelimiters } from "./latex-extractor";

// ─── 公式包装（整段复制专用，使用 \(...\) 和 \[...\] 格式）────────────────

/**
 * 清理 LaTeX 外层分隔符，包含普通 $、$$、\(...\)、\[...\]，
 * 以及 ChatGPT 自带复制产生的错误格式 [ ... ]。
 */
function cleanLatex(raw: string): string {
  let s = stripMathDelimiters(raw.trim());

  // 处理 ChatGPT 错误格式：[ ... ]（只清理最外层）
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim();
    // 确认内部看起来像 LaTeX（包含反斜杠或数学符号），避免误删正常方括号
    if (/[\\^_{}=+\-*/<>]/.test(inner) || inner.length > 0) {
      s = inner;
    }
  }

  return s.trim();
}

/**
 * 把 LaTeX 包装成整段复制时的 Markdown 数学格式。
 * 行内：\(...\)
 * 块级：\[\n...\n\]
 */
function wrapForReply(latex: string, isDisplay: boolean): string {
  const clean = cleanLatex(latex);
  if (isDisplay) {
    return `\\[\n${clean}\n\\]`;
  }
  return `\\(${clean}\\)`;
}

// ─── 公式节点识别（与 dom-to-markdown 一致，用 className 直接匹配）─────────

const MATH_CLASS_PATTERNS = [
  "katex-display",
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

function isDisplayMath(el: HTMLElement): boolean {
  const cls = el.className ?? "";
  if (cls.includes("katex-display") || cls.includes("math-block")) return true;
  if (el.tagName.toLowerCase() === "mjx-container" && el.getAttribute("display") === "true") return true;
  return false;
}

// ─── DOM → Markdown 转换 ───────────────────────────────────────────────────

const BLOCK_TAGS = new Set([
  "p", "section", "article", "blockquote",
  "h1", "h2", "h3", "h4", "h5", "h6",
]);

/**
 * 递归遍历节点，输出 Markdown 文本。
 * - aria-hidden 节点直接跳过（KaTeX 渲染层）
 * - 公式节点整体输出 \(...\) 或 \[...\]，跳过子节点
 * - 代码块保留为 Markdown 代码块
 * - 列表转为 - / 1. 格式
 */
function walkNode(node: Node, depth = 0): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (!(node instanceof HTMLElement)) return "";

  // 跳过 KaTeX 渲染层
  if (node.getAttribute("aria-hidden") === "true") return "";

  const tag = node.tagName.toLowerCase();

  // ── 公式节点 ──────────────────────────────────────────────────────────────
  if (isMathElement(node)) {
    const latex = extractLatex(node);
    if (!latex) return "";
    const isDisplay = isDisplayMath(node);
    const md = wrapForReply(latex, isDisplay);
    return isDisplay ? `\n${md}\n` : md;
  }

  // ── 代码块 <pre> ──────────────────────────────────────────────────────────
  if (tag === "pre") {
    const codeEl = node.querySelector("code");
    const lang = codeEl?.className?.match(/language-(\w+)/)?.[1] ?? "";
    const code = (codeEl ?? node).textContent ?? "";
    return `\n\`\`\`${lang}\n${code.trimEnd()}\n\`\`\`\n`;
  }

  // ── 行内代码 <code>（不在 pre 里）─────────────────────────────────────────
  if (tag === "code") {
    return "`" + (node.textContent ?? "") + "`";
  }

  // ── <br> ──────────────────────────────────────────────────────────────────
  if (tag === "br") return "\n";

  // ── 无序列表 <ul> ─────────────────────────────────────────────────────────
  if (tag === "ul") {
    let result = "\n";
    for (const child of node.children) {
      if (child.tagName.toLowerCase() === "li") {
        result += `- ${walkChildren(child, depth + 1).trim()}\n`;
      }
    }
    return result;
  }

  // ── 有序列表 <ol> ─────────────────────────────────────────────────────────
  if (tag === "ol") {
    let result = "\n";
    let idx = 1;
    for (const child of node.children) {
      if (child.tagName.toLowerCase() === "li") {
        result += `${idx}. ${walkChildren(child, depth + 1).trim()}\n`;
        idx++;
      }
    }
    return result;
  }

  // ── 标题 ──────────────────────────────────────────────────────────────────
  if (tag === "h1") return `\n# ${walkChildren(node, depth)}\n`;
  if (tag === "h2") return `\n## ${walkChildren(node, depth)}\n`;
  if (tag === "h3") return `\n### ${walkChildren(node, depth)}\n`;
  if (tag === "h4") return `\n#### ${walkChildren(node, depth)}\n`;

  // ── 段落和块级容器 ────────────────────────────────────────────────────────
  if (BLOCK_TAGS.has(tag)) {
    const inner = walkChildren(node, depth).trimEnd();
    return inner ? `${inner}\n` : "";
  }

  // ── 链接：只保留文字 ──────────────────────────────────────────────────────
  if (tag === "a") {
    return walkChildren(node, depth);
  }

  // ── 其他容器：递归子节点 ──────────────────────────────────────────────────
  return walkChildren(node, depth);
}

function walkChildren(node: HTMLElement | DocumentFragment, depth: number): string {
  let result = "";
  for (const child of node.childNodes) {
    result += walkNode(child, depth);
  }
  return result;
}

/**
 * 把一整条 ChatGPT assistant 回复转换为 Markdown 文本。
 */
export function convertReplyToMarkdown(replyElement: HTMLElement): string {
  const raw = walkChildren(replyElement, 0);
  // 清理多余的连续空行（超过两个换行压缩为两个）
  return raw.replace(/\n{3,}/g, "\n\n").trim();
}
