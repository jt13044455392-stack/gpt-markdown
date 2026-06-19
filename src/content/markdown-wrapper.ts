import { stripMathDelimiters } from "./latex-extractor";

/**
 * 把 LaTeX 包装成 Markdown 数学格式。
 *
 * 行内公式：$latex$
 * 块级公式：$$\nlatex\n$$
 *
 * 输入的 latex 可能已经带有分隔符，会先经过 stripMathDelimiters 清理。
 */
export function wrapAsMarkdownMath(latex: string, isDisplay: boolean): string {
  const clean = stripMathDelimiters(latex);

  if (isDisplay) {
    return `$$\n${clean}\n$$`;
  }

  return `$${clean}$`;
}
