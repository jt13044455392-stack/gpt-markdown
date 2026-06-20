import { SiteAdapter } from "../site-adapter";

export class ClaudeAdapter implements SiteAdapter {
  site: "claude" = "claude";

  findAssistantReplies(): HTMLElement[] {
    return this.collectUnique([
      '[data-message-author-role="assistant"]',
      '[data-message-role="assistant"]',
      '[data-testid="assistant-message"]',
      '[data-testid*="assistant"]',
      'article[data-testid*="conversation-turn"]',
      '[data-testid*="conversation-turn"][data-is-streaming]',
    ]).filter((el) => this.hasReplyText(el));
  }

  findActionBar(replyElement: HTMLElement): HTMLElement | null {
    const actionBar = this.firstHTMLElement(replyElement, [
      '[data-testid*="message-actions"]',
      '[data-testid*="action-bar"]',
      '[aria-label*="message actions" i]',
      '[aria-label*="actions" i]',
      '[role="toolbar"]',
    ]);
    if (actionBar) return actionBar;

    const buttons = replyElement.querySelectorAll("button");
    if (buttons.length > 0) {
      return buttons[buttons.length - 1].parentElement;
    }

    return null;
  }

  findReplyContent(replyElement: HTMLElement): HTMLElement | null {
    const content = this.firstHTMLElement(replyElement, [
      '[data-testid*="message-content"]',
      '[data-testid*="content"]',
      '[class*="message-content"]',
      '[class*="response-content"]',
      ".prose",
    ]);
    if (content && this.hasReplyText(content)) return content;

    for (const child of Array.from(replyElement.children) as HTMLElement[]) {
      if (child.tagName.toLowerCase() === "div" && this.hasReplyText(child)) {
        return child;
      }
    }

    return this.hasReplyText(replyElement) ? replyElement : null;
  }

  private collectUnique(selectors: string[]): HTMLElement[] {
    const seen = new Set<HTMLElement>();
    const results: HTMLElement[] = [];

    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (!(el instanceof HTMLElement) || seen.has(el)) return;
        seen.add(el);
        results.push(el);
      });
    });

    return results;
  }

  private firstHTMLElement(root: HTMLElement, selectors: string[]): HTMLElement | null {
    for (const selector of selectors) {
      const el = root.querySelector(selector);
      if (el instanceof HTMLElement) return el;
    }

    return null;
  }

  private hasReplyText(el: HTMLElement): boolean {
    return Boolean(el.textContent?.trim());
  }
}
