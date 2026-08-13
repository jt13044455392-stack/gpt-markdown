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
export function extractLatex(element: Element | any): string | null {
  if (!element || typeof element.getAttribute !== "function") return null;

  // ── 第零优先级：向上或在当前节点查找 data-gpt-md-tex ──────────────────────
  const texTarget = (typeof element.closest === "function" ? element.closest("[data-gpt-md-tex]") : null) ?? element;
  const gptMdTex = typeof texTarget.getAttribute === "function" ? texTarget.getAttribute("data-gpt-md-tex") : null;
  if (typeof gptMdTex === "string" && gptMdTex.trim().length > 0 && gptMdTex !== "undefined") {
    return gptMdTex.trim();
  }

  // ── 第一优先级：data-math ──────────────────────────────────────────
  const mathTarget = (typeof element.closest === "function" ? element.closest("[data-math]") : null) ?? element;
  const dataMath = typeof mathTarget.getAttribute === "function" ? mathTarget.getAttribute("data-math") : null;
  if (dataMath && dataMath.trim().length > 0 && dataMath !== "undefined") {
    return dataMath.trim();
  }

  // ── 第二优先级：annotation 节点（直接 querySelector 或 getElementsByTagName）─────
  const container = (typeof element.closest === "function"
    ? element.closest(".katex, .katex-display, .math-display, .math-inline, .math-block, [data-math], mjx-container, math")
    : null) ?? element;

  const annotations: Element[] = [];
  if (typeof container.querySelectorAll === "function") {
    container.querySelectorAll("annotation").forEach((a: Element) => annotations.push(a));
  } else if (typeof container.getElementsByTagName === "function") {
    Array.from(container.getElementsByTagName("annotation")).forEach((a: any) => annotations.push(a));
  }

  for (const annotation of annotations) {
    const encoding = (annotation.getAttribute("encoding") ?? "").toLowerCase();
    const text = annotation.textContent?.trim();
    if (text && text.length > 0 && text !== "undefined") {
      if (encoding.includes("tex") || encoding.includes("latex") || encoding === "application/x-tex") {
        return text;
      }
      if (looksLikeLatex(text)) {
        return text;
      }
    }
  }

  // ── 第三优先级：MathML alttext 属性 ────────────────────────────────
  const mathTag = container.tagName?.toLowerCase() === "math" ? container : container.querySelector?.("math");
  const altText = mathTag?.getAttribute("alttext")?.trim();
  if (altText && altText.length > 0 && altText !== "undefined") {
    return altText;
  }

  // ── 第四优先级：aria-label（内容像 LaTeX）─────────────────────────────
  const ariaLabel = element.getAttribute("aria-label") ?? container.getAttribute("aria-label");
  if (ariaLabel && looksLikeLatex(ariaLabel) && ariaLabel !== "undefined") {
    return ariaLabel.trim();
  }

  // ── 第五优先级：data-latex / data-tex ─────────────────────────────────
  for (const attr of ["data-latex", "data-tex"]) {
    const val = element.getAttribute(attr) ?? container.getAttribute(attr);
    if (val && val.trim().length > 0 && val !== "undefined") {
      return val.trim();
    }
  }

  return null;
}
