"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Trash2, Bot, User, Loader2 } from "lucide-react";
import { sendChat, getChatHistory, clearChatHistory, type ChatMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function ChatWindow({ onPortfolioChange }: { onPortfolioChange: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getChatHistory().then((h) => {
      setMessages(h);
      setHistoryLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (historyLoaded) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, historyLoaded]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    try {
      const reply = await sendChat(text);
      setMessages((m) => [...m, reply]);
      // If the message might have changed the portfolio, trigger a refresh
      const portfolioKeywords = ["add", "remove", "delete", "update", "shares", "bought", "sold"];
      if (portfolioKeywords.some((k) => text.toLowerCase().includes(k))) {
        onPortfolioChange();
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Sorry, I couldn't reach the AI. Is Ollama running?" },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, onPortfolioChange]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function clear() {
    if (!confirm("Clear chat history?")) return;
    await clearChatHistory();
    setMessages([]);
  }

  const SUGGESTIONS = [
    "How is my portfolio doing today?",
    "What's the news on my holdings?",
    "Add 10 shares of AAPL at $180",
    "Compare NVDA vs AMD",
  ];

  return (
    <div className="flex flex-col h-full rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-primary" />
          <span className="font-semibold text-sm">AI Assistant</span>
          <span className="text-xs text-muted-foreground">(Qwen3 32B · local)</span>
        </div>
        <button onClick={clear} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground" title="Clear history">
          <Trash2 size={14} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 && !loading && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Ask me anything about your portfolio or the market.
            </p>
            <div className="grid grid-cols-1 gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="text-left text-xs px-3 py-2 rounded-lg border border-border hover:border-primary/50 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn("flex gap-3", m.role === "user" ? "flex-row-reverse" : "flex-row")}>
            <div
              className={cn(
                "shrink-0 w-7 h-7 rounded-full flex items-center justify-center",
                m.role === "user" ? "bg-primary/20 text-primary" : "bg-accent text-muted-foreground"
              )}
            >
              {m.role === "user" ? <User size={13} /> : <Bot size={13} />}
            </div>
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                m.role === "user"
                  ? "bg-primary/20 text-foreground rounded-tr-sm"
                  : "bg-accent text-foreground rounded-tl-sm"
              )}
            >
              <div className="chat-content whitespace-pre-wrap">{m.content}</div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center">
              <Bot size={13} className="text-muted-foreground" />
            </div>
            <div className="bg-accent rounded-xl rounded-tl-sm px-3 py-2.5">
              <Loader2 size={14} className="animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about your portfolio… (Enter to send)"
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm focus:outline-none focus:border-primary placeholder:text-muted-foreground min-h-[38px] max-h-32"
            style={{ height: "auto" }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = Math.min(t.scrollHeight, 128) + "px";
            }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="shrink-0 p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
