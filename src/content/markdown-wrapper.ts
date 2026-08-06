import { stripMathDelimiters } from "./latex-extractor";

/**
 * 把 LaTeX 多行输入规范化为单行格式。
 *
 * 作用：
 *   1. 去掉首尾空白
 *   2. 把普通换行改成空格
 *   3. 合并连续多个空格为单个空格
 *   4. 保留 LaTeX 命令（包含反斜杠）
 *   5. 不破坏 \\ 这种 LaTeX 换行命令
 *
 * 示例：
 *   "\\Delta \\sim \\mathcal O(1-10)" → "\\Delta \\sim \\mathcal O(1-10)"
 *   "\\frac{1}{2}\n\\times 3" → "\\frac{1}{2} \\times 3"
 */
export function normalizeLatexToSingleLine(input: string): string {
  // 1. 去掉首尾空白
  let result = input.trim();

  // 2. 把真实换行（\n、\r\n 或 \r）替换成空格，不改动 LaTeX 的 \\ 命令
  result = result.replace(/\r\n?|\n/g, " ");

  // 3. 合并连续多个空格为单个空格
  result = result.replace(/  +/g, " ");

  return result;
}

/**
 * 把 LaTeX 包装成 Markdown 数学格式。
 *
 * 行内公式：$latex$
 * 块级公式：$$latex$$
 *
 * 输入的 latex 可能已经带有分隔符，会先经过 stripMathDelimiters 清理。
 * 然后通过 normalizeLatexToSingleLine 转换成单行格式。
 */
export function wrapAsMarkdownMath(latex: string, isDisplay: boolean): string {
  const clean = stripMathDelimiters(latex);
  const normalized = normalizeLatexToSingleLine(clean);

  if (isDisplay) {
    return `$$${normalized}$$`;
  }

  return `$${normalized}$`;
}
