import { describe, it, expect, beforeEach } from "vitest";
import { ChatGPTAdapter } from "../src/content/adapters/chatgpt-adapter";
import { setupReplyMarkdownCopyButtons } from "../src/content/reply-button-injector";

describe("测试侧边栏与历史会话导航安全防护", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    Object.defineProperty(window, "location", {
      value: new URL("https://chatgpt.com/c/12345"),
      writable: true,
    });
  });

  it("findAssistantReplies 必须严格忽略侧边栏 nav / aside / sidebar 内的所有元素", () => {
    document.body.innerHTML = `
      <nav id="sidebar" data-testid="sidebar">
        <div class="w-full">
          <a href="/c/123" class="w-full">历史会话 1 (含 $x=1$ 公式标题)</a>
          <a href="/c/456" class="w-full">历史会话 2</a>
        </div>
      </nav>
      <main role="main">
        <div data-testid="conversation-turn-3">
          <div data-message-author-role="assistant">
            <div class="markdown">这里是真实回复内容：$E=mc^2$</div>
            <div role="group">
              <button data-testid="copy-turn-action-button">复制</button>
            </div>
          </div>
        </div>
      </main>
    `;

    const adapter = new ChatGPTAdapter();
    const replies = adapter.findAssistantReplies();

    // 只能找到 main 里面的 assistant 回复，绝不能包含 sidebar
    expect(replies.length).toBe(1);
    expect(replies[0].closest("#sidebar")).toBeNull();
  });

  it("复制按钮只能注入到操作栏或 turn 容器外层，绝不能直接插入到 React 管理的 .markdown 内部", () => {
    document.body.innerHTML = `
      <main role="main">
        <div data-testid="conversation-turn-3" class="turn-root">
          <div data-message-author-role="assistant">
            <div class="markdown">这里是真实回复内容</div>
            <div role="group" class="action-bar">
              <button data-testid="copy-turn-action-button">复制</button>
            </div>
          </div>
        </div>
      </main>
    `;

    setupReplyMarkdownCopyButtons();

    const markdownEl = document.querySelector(".markdown");
    const copyButton = document.querySelector("[data-ai-md-copy]");

    expect(copyButton).not.toBeNull();
    // 按钮必须在操作栏里，绝不能成为 .markdown 的子元素
    expect(markdownEl?.contains(copyButton)).toBe(false);
    expect(document.querySelector(".action-bar")?.contains(copyButton)).toBe(true);
  });
});
