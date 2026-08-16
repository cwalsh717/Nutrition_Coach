"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function ChatPanel({ weekId, initialMessages }: { weekId: string; initialMessages: Message[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setError("");
    setBusy(true);
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "user", content: message }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, weekId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "The coach didn't answer — try again.");
      } else {
        setMessages((m) => [...m, { id: data.id, role: "assistant", content: data.reply }]);
      }
    } catch {
      setError("Network hiccup — your message was saved; ask again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Ask anything about this week — &quot;what&apos;s my protein gap?&quot;, &quot;does this list
            look right?&quot;, &quot;what should I add to fill the bank?&quot;
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
              m.role === "user"
                ? "self-end bg-primary text-primary-foreground"
                : "self-start border bg-card",
            )}
          >
            {m.role === "assistant" ? (
              <div className="prose prose-sm prose-invert max-w-none [&_p]:my-1.5 [&_ul]:my-1.5 [&_strong]:text-primary">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
            ) : (
              // pre-wrap so multi-line questions (lists!) keep their shape
              <div className="whitespace-pre-wrap">{m.content}</div>
            )}
          </div>
        ))}
        {busy && (
          <div className="self-start rounded-2xl border bg-card px-4 py-2.5 text-sm text-muted-foreground">
            thinking…
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="sticky bottom-20 flex items-end gap-2 bg-background pt-1 md:bottom-4">
        {/* field-sizing-content on the base Textarea grows it as lines are added */}
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter drops to a new line so you can write lists.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(e);
            }
          }}
          placeholder="Ask the coach…  (Shift+Enter for a new line)"
          disabled={busy}
          rows={1}
          className="max-h-40 min-h-9 resize-none"
        />
        <Button type="submit" disabled={busy || !input.trim()}>Send</Button>
      </form>
    </div>
  );
}
