"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Trash2, Bot, User, Loader2, Brain, ChevronDown } from "lucide-react";
import { getChatHistory, clearChatHistory, type ChatMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

const MODELS = [
  { id: "qwen3:32b", label: "32B", description: "Smarter, slower" },
  { id: "qwen3:8b",  label: "8B",  description: "Faster, lighter" },
];

export default function ChatWindow({ onPortfolioChange }: { onPortfolioChange: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [model, setModel] = useState(MODELS[0].id);
  const [think, setThink] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getChatHistory().then((h) => { setMessages(h); setHistoryLoaded(true); });
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
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    try {
      const resp = await fetch("/api/chat/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, model, think }),
      });

      if (!resp.ok || !resp.body) throw new Error("no response");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const raw = line.replace(/^data:\s*/, "").trim();
          if (!raw) continue;
          try {
            const chunk = JSON.parse(raw);
            if (chunk.token) {
              setMessages((m) => {
                const updated = [...m];
                const last = updated[updated.length - 1];
                updated[updated.length - 1] = { ...last, content: last.content + chunk.token };
                return updated;
              });
              bottomRef.current?.scrollIntoView({ behavior: "smooth" });
            }
          } catch { /* ignore */ }
        }
      }

      // Refresh portfolio panel whenever a mutation might have happened
      const portfolioKeywords = ["add", "remove", "delete", "update", "shares", "bought", "sold", "position", "holding"];
      if (portfolioKeywords.some((k) => text.toLowerCase().includes(k))) onPortfolioChange();
    } catch {
      setMessages((m) => {
        const updated = [...m];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Sorry, I couldn't reach the AI. Is Ollama running?",
        };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }, [input, loading, model, think, onPortfolioChange]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
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

  const currentModel = MODELS.find((m) => m.id === model) ?? MODELS[0];

  return (
    <div className="flex flex-col h-full rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Bot size={15} className="text-primary shrink-0" />
          <span className="font-semibold text-sm">AI Assistant</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Thinking toggle */}
          <button
            onClick={() => setThink((v) => !v)}
            title={think ? "Thinking ON — deeper but slower" : "Thinking OFF — faster"}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors",
              think
                ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            <Brain size={12} />
            {think ? "Thinking" : "Fast"}
          </button>

          {/* Model selector */}
          <div className="relative">
            <button
              onClick={() => setModelOpen((v) => !v)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              {currentModel.label}
              <ChevronDown size={11} className={cn("transition-transform", modelOpen && "rotate-180")} />
            </button>

            {modelOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-border bg-card shadow-xl overflow-hidden">
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setModel(m.id); setModelOpen(false); }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-accent transition-colors",
                      model === m.id && "text-primary"
                    )}
                  >
                    <span className="font-medium">{m.label}</span>
                    <span className="text-muted-foreground">{m.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={clear} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground" title="Clear history">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0" onClick={() => setModelOpen(false)}>
        {messages.length === 0 && !loading && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Ask me anything about your portfolio or the market.
            </p>
            <div className="grid grid-cols-1 gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => setInput(s)}
                  className="text-left text-xs px-3 py-2 rounded-lg border border-border hover:border-primary/50 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn("flex gap-3", m.role === "user" ? "flex-row-reverse" : "flex-row")}>
            <div className={cn(
              "shrink-0 w-7 h-7 rounded-full flex items-center justify-center",
              m.role === "user" ? "bg-primary/20 text-primary" : "bg-accent text-muted-foreground"
            )}>
              {m.role === "user" ? <User size={13} /> : <Bot size={13} />}
            </div>
            <div className={cn(
              "max-w-[85%] rounded-xl px-3 py-2 text-sm",
              m.role === "user"
                ? "bg-primary/20 text-foreground rounded-tr-sm"
                : "bg-accent text-foreground rounded-tl-sm"
            )}>
              {m.content
                ? <div className="chat-content whitespace-pre-wrap">{m.content}</div>
                : <Loader2 size={14} className="animate-spin text-muted-foreground" />
              }
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border">
        <div className="flex gap-2 items-end">
          <textarea
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
          <button onClick={send} disabled={loading || !input.trim()}
            className="shrink-0 p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
