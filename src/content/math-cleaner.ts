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

  // 2. 清除公式末尾残留的孤立右方括号与标点 (如 $$\boxed{...}$$. \n ] -> $$\boxed{...}$$.)
  s = s.replace(/(\$\$[\s\S]*?\$\$)\s*([.,，。])?\s*\n*\s*\]/g, "$1$2");

  // 3. 修复孤立脱落的短 [ \n f(M) \n ] -> $f(M)$
  s = s.replace(/(?:^|\n)\s*\[\s*\n+\s*([a-zA-Z0-9_\-\(\)\s\\^_{}=+\-*/,]{1,40}?)\s*\n+\s*\]/g, (match, inner) => {
    const trimmed = inner.trim();
    if (!trimmed.includes("\n") && !trimmed.includes("\\boxed") && !trimmed.includes("\\int") && !trimmed.includes("=")) {
      return `\n\n$${trimmed}$\n\n`;
    }
    return `\n\n$$${trimmed}$$\n\n`;
  });

  // 4. 修复孤立脱落的 [ \boxed{ ... } ] 块或 [ $$...$$ ] 块 -> $$\boxed{ ... }$$
  s = s.replace(/(?:^|\n)\s*\[\s*\n+\s*(\$\$)/g, "\n\n$1");
  s = s.replace(/(\$\$)\s*\n+\s*\]\s*(?:\n|$)/g, "$1\n\n");
  s = s.replace(/(?:^|\n)\s*\[\s*(\$\$\s*\\boxed\{[\s\S]*?\}\s*\$\$)\s*(?:\]|\$\$)?/g, "\n\n$1\n\n");

  // 5. 修复脱落的花括号完整 \boxed{...} 块 (支持任意多层 \text{} 嵌套)
  let boxedIdx = 0;
  while ((boxedIdx = s.indexOf("\\boxed{", boxedIdx)) !== -1) {
    if (isEscaped(s, boxedIdx)) { boxedIdx += 7; continue; }
    let depth = 0;
    let end = -1;
    for (let i = boxedIdx + 6; i < s.length; i++) {
      if (isEscaped(s, i)) continue;
      if (s[i] === "{") depth++;
      else if (s[i] === "}" && --depth === 0) { end = i; break; }
    }
    if (end !== -1) {
      const prefix = s.slice(Math.max(0, boxedIdx - 10), boxedIdx);
      const isDetached = /\[\s*$/.test(prefix);
      if (isDetached) {
        const pStart = boxedIdx - (prefix.length - prefix.lastIndexOf("["));
        const fullBoxed = s.slice(boxedIdx, end + 1);
        let replaceEnd = end + 1;
        while (replaceEnd < s.length && (s[replaceEnd] === "]" || s[replaceEnd] === "$" || s[replaceEnd] === "\n" || s[replaceEnd] === " ")) {
          replaceEnd++;
        }
        s = s.slice(0, pStart) + `\n\n$$${fullBoxed}$$\n\n` + s.slice(replaceEnd);
        boxedIdx = pStart + fullBoxed.length + 8;
        continue;
      }
    }
    boxedIdx += 7;
  }

  // 6. 收缩紧贴已闭合公式的多余 $$ 符号 (如 $$\boxed{...}$$$$ -> $$\boxed{...}$$)
  s = s.replace(/(\$\$[\s\S]*?\$\$)\s*\$\$/g, "$1");
  s = s.replace(/\$\$\s*(\$\$[\s\S]*?\$\$)/g, "$1");

  // 7. 收缩 3 个及以上连续的 $$$$ -> $$
  s = s.replace(/\${3,}/g, "$$");

  // 8. 修复脱落的 [ \delta\text{-function} ] -> $\delta\text{-function}$
  s = s.replace(/(?<!\\)\[\s*(\\?[a-zA-Z0-9_\-\{\}]*\\(?:text|mathrm)[^\]]*)\s*\]/g, (match, inner) => {
    if (!inner.includes("\n")) {
      return `$${inner.trim()}$`;
    }
    return match;
  });

  // 9. 修复脱落的 (w\simeq1) 独立条件等式 -> $w\simeq1$
  s = s.replace(/(?<!\\[a-zA-Z]+)\(\s*([a-zA-Z0-9_\\\^\-+=\s<>≤≥±]*\\[a-zA-Z]+[a-zA-Z0-9_\\\^\-+=\s<>≤≥±]*=[a-zA-Z0-9_\\\^\-+=\s<>≤≥±]*)\s*\)/g, (match, inner) => {
    if (!/^\d+(?:[.,]\d+)?$/.test(inner.trim())) {
      return `$${inner.trim()}$`;
    }
    return match;
  });

  // 10. 再次清除末尾孤立的 ] 和收缩多余 $$
  s = s.replace(/(\$\$[\s\S]*?\$\$)\s*([.,，。])?\s*\n*\s*\]/g, "$1$2");
  s = s.replace(/(\$\$[\s\S]*?\$\$)\s*\$\$/g, "$1");
  s = s.replace(/\$\$\s*(\$\$[\s\S]*?\$\$)/g, "$1");
  s = s.replace(/\${3,}/g, "$$");

  // 11. 保证 Markdown 标题 (### 标题) 前后有独立双换行，绝不与上一行挤在一起
  s = s.replace(/([^\n])\s*\n?\s*(#{1,6}\s+[^\n]+)/g, "$1\n\n$2");

  return s;
}

export function repairLatexMultiLineEnvironments(latex: string): string {
  if (typeof latex !== "string" || !latex.includes("\\begin{")) return latex;

  // 匹配所有多行数学环境 \begin{env} ... \end{env}
  const envRegex = /\\begin\{(array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|cases|rcases|dcases|align|aligned|align\*|split|gather|gathered|gather\*|eqnarray|eqnarray\*)\}([\s\S]*?)\\end\{\1\}/g;

  return latex.replace(envRegex, (match, envName, body) => {
    let repairedBody = body;

    // 1. 修复 \ \hline -> \\ \hline
    repairedBody = repairedBody.replace(/(?<!\\)\\\s+(\\hline)/g, " \\\\ $1");

    // 2. 修复行末误变为单反斜杠加空格的场景 (如 & 1.05\ 3\times10^8 -> & 1.05 \\ 3\times10^8)
    repairedBody = repairedBody.replace(/([0-9a-zA-Z_\}\]\)])(?<!\\)\\\s+([0-9a-zA-Z_\{\[\\])/g, "$1 \\\\ $2");

    // 3. 修复丢失双反斜杠但紧跟 \hline 的情况
    repairedBody = repairedBody.replace(/([^\\\s])\s*\\hline/g, "$1 \\\\ \\hline");

    return `\\begin{${envName}}${repairedBody}\\end{${envName}}`;
  });
}

export function cleanLatexBody(raw: string): string {
  let s = raw.trim();

  // 自动修复多行数学环境 (array, matrix, cases, align) 中脱落的换行 \\
  s = repairLatexMultiLineEnvironments(s);

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

  // 将多行硬换行压缩为空格，实现单行紧凑输出 (保留 \\)
  s = s.replace(/\s*\n\s*/g, " ").trim();
  return s;
}

export function compactMarkdownSpaces(text: string): string {
  if (typeof text !== "string" || !text.trim()) return text;

  let s = text;

  // 1. 消除 3 个及以上的连续 $ (如 $$$$)，收缩为标准的单个 $$
  s = s.replace(/\${3,}/g, "$$");

  // 2. 消除块级公式 $$...$$ 上下多余的连续空行，保持公式与正文紧凑衔接
  s = s.replace(/\n{2,}\s*(\$\$[\s\S]*?\$\$)\s*\n{2,}/g, "\n$1\n");
  s = s.replace(/([^\n])\n{2,}\s*(\$\$[\s\S]*?\$\$)/g, "$1\n$2");
  s = s.replace(/(\$\$[\s\S]*?\$\$)\n{2,}\s*([^\n])/g, "$1\n$2");

  // 3. 消除连续 3 个以上的冗余换行
  s = s.replace(/\n{3,}/g, "\n\n");

  return s.trim();
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
