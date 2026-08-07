/**
 * Math Cleaner Utilities for GPT Markdown.
 * 提供统一的预清洗、语法修复与公式合法性校验逻辑。
 */

export function isEscaped(str: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && str[i] === "\\"; i--) {
    slashes++;
  }
  return slashes % 2 === 1;
}

export function cleanOuterParens(text: string): string {
  let s = text.trim();
  while (s.startsWith("(") && s.endsWith(")") && s.length > 2) {
    let depth = 0;
    let valid = true;
    for (let i = 0; i < s.length - 1; i++) {
      if (s[i] === "\\") { i++; continue; }
      if (s[i] === "(") depth++;
      else if (s[i] === ")") depth--;
      if (depth === 0) { valid = false; break; }
    }
    if (valid && depth === 1) {
      s = s.slice(1, -1).trim();
    } else {
      break;
    }
  }
  return s;
}

export function preSanitizeChatGPTText(text: string): string {
  if (typeof text !== "string" || !text.trim()) return text;
  let s = text
    .replace(/\\right\$\$\s*\^2/g, "\\right]^2")
    .replace(/\\right\$\$\s*\.?\s*\n?\]?/g, "\\right].$$")
    .replace(/\\right\$\$\s*,?\s*\n?\]?/g, "\\right],$$")
    .replace(/\\right\$\$/g, "\\right]")
    .replace(/\\left\$\$/g, "\\left[")
    .replace(/\\left\s*\{/g, "\\left\\{")
    .replace(/\\right\s*\}/g, "\\right\\}");

  // 1. 修复脱落的伪 $$ 头部 (如 $$k\tau\gg1; ] * reheating -> $k\tau\gg1$ * reheating)
  s = s.replace(/(^|\s)\$\$\s*([a-zA-Z0-9_\\\^\-+=\(\)\s<>≤≥±,]{2,40})\s*(?:;\s*\]|;|\])\s*(?=\*|\#|[\u4e00-\u9fa5])/g, (_m, p1, p2) => {
    return `${p1}$${p2.trim()}$ `;
  });

  // 2. 修复脱落的末尾 [ \boxed{ ... }$$ 块 -> $$\boxed{ ... }$$
  s = s.replace(/(?:\[\s*)?(\\boxed\{[\s\S]*?\})\s*(?:\$\$|\](?:\$\$)?)/g, (_m, p1) => {
    return `\n\n$$${p1.trim()}$$\n\n`;
  });

  // 3. 修复脱落的 [ \delta\text{-function} ] -> $\delta\text{-function}$
  s = s.replace(/(?<!\\)\[\s*(\\?[a-zA-Z0-9_\-\{\}]*\\(?:text|mathrm)[^\]]*)\s*\]/g, (match, inner) => {
    if (!inner.includes("\n")) {
      return `$${inner.trim()}$`;
    }
    return match;
  });

  // 4. 修复脱落的 (w\simeq1) 独立条件等式 -> $w\simeq1$
  s = s.replace(/(?<!\\[a-zA-Z]+)\(\s*([a-zA-Z0-9_\\\^\-+=\s<>≤≥±]*\\[a-zA-Z]+[a-zA-Z0-9_\\\^\-+=\s<>≤≥±]*=[a-zA-Z0-9_\\\^\-+=\s<>≤≥±]*)\s*\)/g, (match, inner) => {
    if (!/^\d+(?:[.,]\d+)?$/.test(inner.trim())) {
      return `$${inner.trim()}$`;
    }
    return match;
  });

  return s;
}

export function cleanLatexBody(raw: string): string {
  let s = raw.trim();

  // 自动修复破损的 \right$$ 与 \left$$，补全方括号闭合与上标 ^2
  s = s.replace(/\\right\$\$\s*\^2/g, "\\right]^2")
       .replace(/\\right\$\$\s*\.?\s*\n?\]?/g, "\\right].$$")
       .replace(/\\right\$\$\s*,?\s*\n?\]?/g, "\\right],$$")
       .replace(/\\right\$\$/g, "\\right]")
       .replace(/\\left\$\$/g, "\\left[");

  // 自动修复脱落反斜杠的花括号 \left{ -> \left\{ 与 \right} -> \right\}
  s = s.replace(/\\left\s*\{/g, "\\left\\{")
       .replace(/\\right\s*\}/g, "\\right\\}");

  // 剥离外层误包含的 [ 和 ]
  while (s.startsWith("[") && s.endsWith("]") && s.length > 2) {
    s = s.slice(1, -1).trim();
  }

  // 清理 ChatGPT / HTML DOM 误产生的 markdown 标题分隔符线 (=== / ---)
  s = s.replace(/\n\s*={3,}\s*\n/g, " = ")
       .replace(/={3,}/g, "=")
       .replace(/\n\s*-{3,}\s*\n/g, " - ")
       .replace(/-{3,}/g, "-");

  // 将多行硬换行压缩为空格，实现单行紧凑输出
  s = s.replace(/\s*\n\s*/g, " ").trim();
  return s;
}

export function isInvalidFormulaBody(body: string): boolean {
  // 1. 包含 Markdown 标题 (# 标题)，无论前面是空格还是换行
  if (/(?:^|\s|\n)#+\s/.test(body)) return true;

  // 2. 包含多个无反斜杠的列表符 * 或 -
  if ((body.match(/(?:^|\s|\n)[\*\-]\s/g) || []).length >= 2) return true;

  // 3. 剥离 \text{...} 与 \mathrm{...} 内部中文后，仍含有连续中文字符
  const bodyWithoutText = body.replace(/\\(?:text|mathrm|mb|rm|ka)\{[^}]*\}/g, "");
  if (/[\u4e00-\u9fa5]{3,}/u.test(bodyWithoutText)) return true;

  return false;
}
