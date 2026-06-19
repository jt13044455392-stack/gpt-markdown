/**
 * 判断一个字符串是否"看起来像 LaTeX"。
 * 不要过度严格，只过滤明显不是公式的纯自然语言文本。
 */
export function looksLikeLatex(text: string): boolean {
  if (!text || text.trim().length === 0) return false;

  // 包含常见 LaTeX 控制序列或数学符号
  const LATEX_PATTERNS = [
    /\\/,           // 反斜杠（\frac、\sum、\int 等）
    /\^/,           // 上标
    /_/,            // 下标
    /\{.*\}/,       // 花括号
    /=/,            // 等号（数学方程）
    /[+\-*/<>≤≥±∓∞∂∇∑∏∫]/u, // 数学运算符
    /\\(?:frac|sum|int|sqrt|lim|infty|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|omega|partial|nabla|cdot|times|div|pm|leq|geq|neq|approx|equiv|subset|supset|cup|cap|in|notin|forall|exists|rightarrow|leftarrow|Rightarrow|Leftarrow|leftrightarrow|mathbb|mathbf|mathrm|text|begin|end|matrix|pmatrix|bmatrix|cases|align|equation)\b/,
  ];

  return LATEX_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * 移除 LaTeX 字符串外层已有的数学分隔符，避免复制出重复的 $。
 * 只处理最外层，不破坏公式内部内容。
 *
 * 支持的格式：
 *   $$...$$
 *   $...$
 *   \[...\]
 *   \(...\)
 */
export function stripMathDelimiters(input: string): string {
  let s = input.trim();

  // 顺序很重要：先处理 $$ 再处理 $，避免 $$ 被当成两个 $ 处理
  if (s.startsWith("$$") && s.endsWith("$$") && s.length > 4) {
    return s.slice(2, -2).trim();
  }

  if (s.startsWith("$") && s.endsWith("$") && s.length > 2) {
    return s.slice(1, -1).trim();
  }

  if (s.startsWith("\\[") && s.endsWith("\\]")) {
    return s.slice(2, -2).trim();
  }

  if (s.startsWith("\\(") && s.endsWith("\\)")) {
    return s.slice(2, -2).trim();
  }

  return s;
}

/**
 * 从公式 DOM 元素中提取 LaTeX 源码。
 *
 * 提取优先级：
 *   1. data-math 属性
 *   2. <annotation encoding="application/x-tex"> 或含 tex/latex 的 encoding
 *   3. 任意 <annotation>（内容像 LaTeX）
 *   4. aria-label（内容像 LaTeX）
 *   5. data-latex / data-tex 属性
 *
 * 找不到时返回 null。
 */
export function extractLatex(element: HTMLElement): string | null {
  // ── 第一优先级：data-math ──────────────────────────────────────────
  const dataMath = element.getAttribute("data-math");
  if (dataMath && dataMath.trim().length > 0) {
    return dataMath.trim();
  }

  // ── 第二优先级：TeX annotation（精确 encoding）───────────────────────
  const TEX_ENCODINGS = [
    'annotation[encoding="application/x-tex"]',
    'annotation[encoding*="tex"]',
    'annotation[encoding*="latex"]',
  ];

  for (const selector of TEX_ENCODINGS) {
    const annotation = element.querySelector(selector);
    if (annotation) {
      const text = annotation.textContent?.trim();
      if (text && text.length > 0) {
        return text;
      }
    }
  }

  // ── 第三优先级：任意 annotation（内容像 LaTeX）────────────────────────
  const anyAnnotation = element.querySelector("annotation");
  if (anyAnnotation) {
    const text = anyAnnotation.textContent?.trim();
    if (text && looksLikeLatex(text)) {
      return text;
    }
  }

  // ── 第四优先级：aria-label（内容像 LaTeX）─────────────────────────────
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel && looksLikeLatex(ariaLabel)) {
    return ariaLabel.trim();
  }

  // ── 第五优先级：data-latex / data-tex ─────────────────────────────────
  for (const attr of ["data-latex", "data-tex"]) {
    const val = element.getAttribute(attr);
    if (val && val.trim().length > 0) {
      return val.trim();
    }
  }

  return null;
}
