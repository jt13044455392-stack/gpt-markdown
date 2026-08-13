import {
  cleanOuterParens,
  preSanitizeChatGPTText,
  cleanLatexBody,
  isInvalidFormulaBody,
  compactMarkdownSpaces,
  isMathParenthesis,
} from "./math-cleaner";

export interface MarkdownMathExpression {
  latex: string;
  isDisplay: boolean;
}

type MarkdownMathSpan = MarkdownMathExpression & {
  start: number;
  end: number;
};

const CAPTURE_ATTR = "data-gpt-md-capture";
const READY_ATTR = "data-gpt-md-bridge-ready";
const MESSAGE_SOURCE = "gpt-markdown-clipboard-bridge";
const MESSAGE_TYPE = "GPT_MD_NATIVE_COPY_RESULT";

function createRequestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `gpt-md-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isEscaped(text: string, index: number): boolean {
  if (typeof text !== "string") return false;
  let slashCount = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) slashCount++;
  return slashCount % 2 === 1;
}

function findUnescapedDelimiter(text: string, delimiter: string, from: number): number {
  if (typeof text !== "string") return -1;
  let index = text.indexOf(delimiter, from);
  while (index !== -1 && isEscaped(text, index)) {
    index = text.indexOf(delimiter, index + delimiter.length);
  }
  return index;
}

function isLikelyInlineMath(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  // 排除纯数字或常见金额（如 100, 3.99）
  if (/^\d+(?:[.,]\d+)?$/.test(value)) return false;
  return true;
}

function findMatchingParenthesis(text: string, start: number): number {
  let depth = 0;
  for (let index = start; index < text.length; index++) {
    if (isEscaped(text, index)) continue;
    if (text[index] === "(") depth++;
    if (text[index] === ")" && --depth === 0) return index;
  }
  return -1;
}

function cleanOuterParentheses(latex: string): string {
  let s = latex.trim();
  while (s.startsWith("(") && s.endsWith(")") && s.length > 2) {
    let depth = 0;
    let isOuterPair = true;
    for (let i = 0; i < s.length - 1; i++) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")") depth--;
      if (depth === 0) {
        isOuterPair = false;
        break;
      }
    }
    if (isOuterPair) {
      s = s.slice(1, -1).trim();
    } else {
      break;
    }
  }
  return s;
}

function looksLikeBareParenthesisMath(text: string): boolean {
  const value = cleanOuterParentheses(text.trim());
  return isMathParenthesis(value);
}

function findClosingBracketForDisplayFormula(markdown: string, start: number): { endBrace: number; endPos: number } {
  const dollarEnd = markdown.indexOf("$$", start);
  const nlEnd = markdown.indexOf("\n]", start);

  let closeBracket = -1;
  let depth = 0;
  for (let i = start; i < markdown.length; i++) {
    if (isEscaped(markdown, i)) continue;
    if (markdown.startsWith("\\left[", i)) {
      depth++;
      i += 5;
      continue;
    }
    if (markdown.startsWith("\\right]", i)) {
      depth = Math.max(0, depth - 1);
      i += 6;
      continue;
    }
    if (markdown[i] === "[" && !markdown.slice(Math.max(0, i - 5), i).endsWith("\\left")) {
      depth++;
    } else if (markdown[i] === "]" && !markdown.slice(Math.max(0, i - 6), i).endsWith("\\right")) {
      if (depth === 0) {
        closeBracket = i;
        break;
      }
      depth--;
    }
  }

  if (dollarEnd !== -1 && (nlEnd === -1 || dollarEnd < nlEnd) && (closeBracket === -1 || dollarEnd < closeBracket)) {
    return { endBrace: dollarEnd, endPos: dollarEnd + 2 };
  }
  if (nlEnd !== -1 && (closeBracket === -1 || nlEnd < closeBracket)) {
    return { endBrace: nlEnd, endPos: nlEnd + 2 };
  }
  if (closeBracket !== -1) {
    return { endBrace: closeBracket, endPos: closeBracket + 1 };
  }
  return { endBrace: -1, endPos: -1 };
}

function shouldBeDisplayMath(markdown: string, startIndex: number, endIndex: number, latex: string): boolean {
  // 1. 显式块级数学结构：始终为 display
  if (
    latex.includes("\\boxed") ||
    latex.includes("\\begin{") ||
    latex.includes("\\int") ||
    latex.includes("\\sum") ||
    latex.includes("\\prod") ||
    latex.includes("\\iint") ||
    latex.includes("\\oint") ||
    latex.includes("\n") ||
    latex.includes("\\\\")
  ) {
    return true;
  }

  // 2. 获取同行的前后文本（截取至换行符）
  const lineStart = Math.max(0, markdown.lastIndexOf("\n", startIndex - 1) + 1);
  const lineEndIdx = markdown.indexOf("\n", endIndex);
  const lineEnd = lineEndIdx === -1 ? markdown.length : lineEndIdx;

  const sameLinePrefix = markdown.slice(lineStart, startIndex).trim();
  const sameLineSuffix = markdown.slice(endIndex, lineEnd).trim();

  // 3. 如果在同一行内前后紧贴中文字词或连词（如 "灰色虚线 $$ Z=1 $$代表" 或 "$$ Z(k)<1 $$表示"），判定为行内公式
  const hasSameLineChinesePrefix = /[\u4e00-\u9fa5]$/.test(sameLinePrefix);
  const hasSameLineChineseSuffix = /^[,，.。；;]?\s*[\u4e00-\u9fa5]/.test(sameLineSuffix);

  if (hasSameLineChinesePrefix || hasSameLineChineseSuffix) {
    if (latex.length <= 120) {
      return false;
    }
  }

  // 默认独立成行的公式保持为 display
  return true;
}

function scanMarkdownMathExpressions(markdown: string): MarkdownMathSpan[] {
  const expressions: MarkdownMathSpan[] = [];
  let index = 0;

  while (index < markdown.length) {
    // 1. 处理 ```math 代码块公式
    if (markdown.startsWith("```math", index)) {
      const startContent = index + 7;
      const end = markdown.indexOf("```", startContent);
      const fenceEnd = end === -1 ? markdown.length : end + 3;
      const latex = (end === -1 ? markdown.slice(startContent) : markdown.slice(startContent, end)).trim();
      if (latex) {
        expressions.push({ latex, isDisplay: true, start: index, end: fenceEnd });
      }
      index = fenceEnd;
      continue;
    }

    // 2. 忽略其他通用代码块
    if (markdown.startsWith("```", index)) {
      const lineEnd = markdown.indexOf("\n", index);
      const fenceEnd = markdown.indexOf("```", lineEnd === -1 ? markdown.length : lineEnd + 1);
      index = fenceEnd === -1 ? markdown.length : fenceEnd + 3;
      continue;
    }

    // 4. 支持 \boxed{ ... } 环境（Display）
    if (markdown.startsWith("\\boxed{", index)) {
      let depth = 0;
      let end = -1;
      for (let i = index; i < markdown.length; i++) {
        if (isEscaped(markdown, i)) continue;
        if (markdown[i] === "{") depth++;
        if (markdown[i] === "}" && --depth === 0) { end = i; break; }
      }
      if (end !== -1) {
        const latex = markdown.slice(index, end + 1).trim();
        if (latex) {
          expressions.push({ latex, isDisplay: true, start: index, end: end + 1 });
          index = end + 1;
          continue;
        }
      }
    }
    if (markdown.startsWith("\\begin{", index)) {
      const endTagIndex = markdown.indexOf("\\end{", index);
      if (endTagIndex !== -1) {
        const closeBrace = markdown.indexOf("}", endTagIndex + 5);
        if (closeBrace !== -1) {
          const endPos = closeBrace + 1;
          const latex = markdown.slice(index, endPos).trim();
          if (latex) {
            expressions.push({ latex, isDisplay: true, start: index, end: endPos });
            index = endPos;
            continue;
          }
        }
      }
    }

    let close: string | null = null;
    let isDisplay = false;
    let openingLength = 0;

    if (markdown.startsWith("\\[", index)) {
      close = "\\]";
      isDisplay = true;
      openingLength = 2;
    } else if (markdown.startsWith("\\(", index)) {
      close = "\\)";
      isDisplay = false;
      openingLength = 2;
    } else if (markdown.startsWith("$$", index)) {
      close = "$$";
      openingLength = 2;
      const end = findUnescapedDelimiter(markdown, close, index + openingLength);
      if (end !== -1) {
        const rawLatex = markdown.slice(index + openingLength, end).trim();
        if (rawLatex) {
          isDisplay = shouldBeDisplayMath(markdown, index, end + 2, rawLatex);
          expressions.push({ latex: rawLatex, isDisplay, start: index, end: end + 2 });
        }
        index = end + 2;
        continue;
      }
    } else if (
      markdown[index] === "[" &&
      !markdown.slice(Math.max(0, index - 5), index).endsWith("\\left")
    ) {
      const { endBrace, endPos } = findClosingBracketForDisplayFormula(markdown, index + 1);

      if (endBrace !== -1) {
        let rawBody = markdown.slice(index + 1, endBrace);
        if (rawBody.endsWith(".")) rawBody = rawBody.slice(0, -1);
        if (rawBody.includes("\n") || /[\\^_{}=+\-*/<>]/.test(rawBody)) {
          const latex = rawBody.trim();
          if (latex) {
            expressions.push({ latex, isDisplay: true, start: index, end: endPos });
            index = endPos;
            continue;
          }
        }
      }
    } else if (
      markdown[index] === "$" &&
      !isEscaped(markdown, index) &&
      markdown[index + 1] !== "$"
    ) {
      const end = findUnescapedDelimiter(markdown, "$", index + 1);
      if (end !== -1 && markdown[end + 1] !== "$") {
        const latex = markdown.slice(index + 1, end).trim();
        if (isLikelyInlineMath(latex)) {
          const isComplexDisplay = latex.includes("\\frac") || latex.includes("\\int") || latex.includes("\\sum") || latex.includes("\\begin");
          expressions.push({ latex, isDisplay: isComplexDisplay, start: index, end: end + 1 });
          index = end + 1;
          continue;
        }
      }
    } else if (
      markdown[index] === "(" &&
      !isEscaped(markdown, index) &&
      !/[a-zA-Z0-9_\\]$/.test(markdown.slice(Math.max(0, index - 10), index))
    ) {
      // ChatGPT 原生复制有时脱落 \ 留下裸括号 ( ... )
      const end = findMatchingParenthesis(markdown, index);
      if (end !== -1) {
        const rawLatex = markdown.slice(index + 1, end).trim();
        if (looksLikeBareParenthesisMath(rawLatex)) {
          const latex = cleanOuterParentheses(rawLatex);
          expressions.push({ latex, isDisplay: false, start: index, end: end + 1 });
          index = end + 1;
          continue;
        }
      }
    }

    if (close === null) {
      index += 1;
      continue;
    }

    const end = findUnescapedDelimiter(markdown, close, index + openingLength);
    if (end === -1) {
      index += openingLength;
      continue;
    }

    const latex = markdown.slice(index + openingLength, end).trim();
    if (close === "$$" && isInvalidFormulaBody(latex)) {
      index += openingLength;
      continue;
    }

    if (latex) {
      expressions.push({
        latex,
        isDisplay,
        start: index,
        end: end + close.length,
      });
    }
    index = end + close.length;
  }

  return expressions;
}

/** Extract formula source from the copy payload without exposing parser offsets. */
export function extractMarkdownMathExpressions(markdown: string): MarkdownMathExpression[] {
  return scanMarkdownMathExpressions(markdown).map(({ latex, isDisplay }) => ({ latex, isDisplay }));
}

/** Normalize all observed ChatGPT math delimiters to Obsidian Markdown. */
export function normalizeChatGPTMarkdown(markdown: string): string {
  if (typeof markdown !== "string" || !markdown.trim()) return markdown;

  const sanitizedInput = preSanitizeChatGPTText(markdown);
  const expressions = scanMarkdownMathExpressions(sanitizedInput);
  if (expressions.length === 0) return sanitizedInput;

  let result = "";
  let cursor = 0;

  for (const expression of expressions) {
    const gap = sanitizedInput.slice(cursor, expression.start);
    if (isInvalidFormulaBody(expression.latex)) {
      result += gap + expression.latex;
      cursor = expression.end;
      continue;
    }

    result += gap;
    const rawTarget = expression.isDisplay ? expression.latex : cleanOuterParens(expression.latex);
    let clean = cleanLatexBody(rawTarget);

    if (!expression.isDisplay) {
      // 如果行内公式末尾包含逗号/句号等标点，移到公式外部，并转为中文语境标点
      const trailPuncMatch = clean.match(/([,，.。；;])$/);
      if (trailPuncMatch) {
        clean = clean.slice(0, -1).trim();
        const punc = trailPuncMatch[1];
        const cnPunc = punc === "," || punc === "，" ? "，" : punc === "." || punc === "。" ? "。" : punc;
        result += `$${clean}$${cnPunc}`;
      } else {
        result += `$${clean}$`;
      }
    } else {
      result += `$$${clean}$$`;
    }
    cursor = expression.end;
  }

  return compactMarkdownSpaces(result + sanitizedInput.slice(cursor));
}

function isAssistantSection(section: HTMLElement): boolean {
  const label = section.querySelector("h4.sr-only")?.textContent ?? "";
  return (
    /chatgpt|assistant/i.test(label) ||
    section.querySelector('[data-message-author-role="assistant"]') !== null ||
    section.querySelector(".markdown") !== null
  );
}

/** Find the outermost assistant section containing a rendered formula. */
export function findChatGPTReply(element: HTMLElement): HTMLElement | null {
  const sections: HTMLElement[] = [];
  let current: HTMLElement | null = element;
  while (current) {
    if (
      (current.tagName.toLowerCase() === "section" || current.tagName.toLowerCase() === "article") &&
      isAssistantSection(current)
    ) {
      sections.push(current);
    }
    current = current.parentElement;
  }

  if (sections.length > 0) return sections[sections.length - 1];
  return element.closest("section, article, [data-is-streaming]");
}

export function findNativeCopyButton(replyElement: HTMLElement): HTMLButtonElement | null {
  const SELECTORS = [
    'button[data-testid="copy-turn-action-button"]',
    'button[data-testid*="copy"]',
    'button[aria-label*="复制"]',
    'button[aria-label*="Copy"]',
    'button[title*="复制"]',
    'button[title*="Copy"]',
  ];

  for (const sel of SELECTORS) {
    const btn = replyElement.querySelector(sel);
    if (btn instanceof HTMLButtonElement) return btn;
  }

  const turn =
    replyElement.closest('[data-conversation-screenshot-content]') ??
    replyElement.closest("section") ??
    replyElement.closest("article");

  if (turn) {
    for (const sel of SELECTORS) {
      const btn = turn.querySelector(sel);
      if (btn instanceof HTMLButtonElement) return btn;
    }
  }

  return null;
}

export type NativeCopyResult =
  | { markdown: string }
  | { reason: "copy_button_missing" | "bridge_not_loaded" | "native_copy_not_observed" };

/**
 * Capture the text ChatGPT itself supplies to its clipboard API. The MAIN-world
 * bridge publishes that text synchronously, avoiding clipboard.readText(),
 * focus requirements, and stale clipboard races.
 */
export function captureNativeReplyMarkdown(replyElement: HTMLElement): Promise<NativeCopyResult> {
  const button = findNativeCopyButton(replyElement);
  if (!button) return Promise.resolve({ reason: "copy_button_missing" });
  if (document.documentElement.getAttribute(READY_ATTR) !== "true") {
    return Promise.resolve({ reason: "bridge_not_loaded" });
  }

  const requestId = createRequestId();
  return new Promise((resolve) => {
    const timeout = window.setTimeout(finishWithFailure, 1500);

    function finish(result: NativeCopyResult): void {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      if (document.documentElement.getAttribute(CAPTURE_ATTR) === requestId) {
        document.documentElement.removeAttribute(CAPTURE_ATTR);
      }
      resolve(result);
    }

    function finishWithFailure(): void {
      finish({ reason: "native_copy_not_observed" });
    }

    function onMessage(event: MessageEvent<unknown>): void {
      if (event.source !== window || typeof event.data !== "object" || event.data === null) return;
      const data = event.data as {
        source?: string;
        type?: string;
        requestId?: string;
        text?: unknown;
      };
      if (
        data.source !== MESSAGE_SOURCE ||
        data.type !== MESSAGE_TYPE ||
        data.requestId !== requestId ||
        typeof data.text !== "string"
      ) {
        return;
      }
      finish({ markdown: data.text });
    }

    window.addEventListener("message", onMessage);
    document.documentElement.setAttribute(CAPTURE_ATTR, requestId);
    button.click();
  });
}

function isRenderedDisplayFormula(element: Element): boolean {
  if (
    element.closest(".katex-display, .math-display, .math-block") !== null ||
    element.classList.contains("katex-display") ||
    element.classList.contains("math-display") ||
    element.classList.contains("math-block")
  ) {
    return true;
  }
  if (element.tagName.toLowerCase() === "mjx-container" && element.getAttribute("display") === "true") {
    return true;
  }
  if (element.closest('mjx-container[display="true"], [data-display="true"]') !== null) {
    return true;
  }
  return false;
}

function findFormulaRoot(element: HTMLElement): HTMLElement | null {
  const SELECTORS = [
    ".katex-display",
    ".math-display",
    ".math-block",
    ".katex",
    ".math-inline",
    ".math",
    "mjx-container",
    "math",
    "[data-math]",
    "[data-latex]",
    "[data-tex]",
  ];
  for (const selector of SELECTORS) {
    if (element.matches(selector)) return element;
    const closest = element.closest(selector);
    if (closest instanceof HTMLElement) return closest;
  }
  return null;
}

export function findRenderedFormulaIndex(
  replyElement: HTMLElement,
  element: HTMLElement,
  isDisplay: boolean
): number | null {
  const root = findFormulaRoot(element);
  if (!(root instanceof HTMLElement)) return null;

  const allCandidates = Array.from(
    replyElement.querySelectorAll(
      ".katex-display, .math-display, .math-block, .katex, .math-inline, mjx-container, math, [data-math], [data-latex]"
    )
  );

  const topFormulas: HTMLElement[] = [];
  for (const candidate of allCandidates) {
    if (!(candidate instanceof HTMLElement)) continue;
    const hasFormulaParent = topFormulas.some((parent) => parent.contains(candidate));
    if (!hasFormulaParent) {
      topFormulas.push(candidate);
    }
  }

  const matchingFormulas = topFormulas.filter(
    (candidate) => isRenderedDisplayFormula(candidate) === isDisplay
  );

  const index = matchingFormulas.findIndex(
    (candidate) => candidate === root || candidate.contains(root) || root.contains(candidate)
  );

  return index === -1 ? null : index;
}
