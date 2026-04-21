"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = { role: "user" | "assistant"; content: string };

const mdComponents = {
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="leading-relaxed" {...props} />
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc space-y-1 pl-5" {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal space-y-1 pl-5" {...props} />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="leading-relaxed" {...props} />
  ),
  code: ({ className, ...props }: React.HTMLAttributes<HTMLElement>) =>
    className?.includes("language-") ? (
      <code className={className} {...props} />
    ) : (
      <code
        className="rounded bg-black/10 px-1 py-0.5 text-[0.85em] dark:bg-white/10"
        {...props}
      />
    ),
  pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
    <pre
      className="overflow-x-auto rounded bg-black/10 p-2 text-xs dark:bg-white/10"
      {...props}
    />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      className="underline underline-offset-2"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="text-base font-semibold" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="text-base font-semibold" {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="text-sm font-semibold" {...props} />
  ),
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Request failed");
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setMessages([
        ...next,
        { role: "assistant", content: `Error: ${(e as Error).message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col p-6 pb-24">
      <h1 className="mb-4 text-2xl font-semibold">PEP-Agent</h1>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-black/10 p-4 dark:border-white/10">
        {messages.length === 0 && (
          <p className="text-sm text-black/50 dark:text-white/50">
            Say hi to the agent...
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-lg p-3 text-sm ${
              m.role === "user"
                ? "bg-black/5 dark:bg-white/10"
                : "bg-blue-50 dark:bg-blue-950/40"
            }`}
          >
            <div className="mb-1 text-xs font-medium opacity-60">{m.role}</div>
            {m.role === "assistant" ? (
              <div className="space-y-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                  {m.content}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="whitespace-pre-wrap">{m.content}</div>
            )}
          </div>
        ))}
        {loading && <div className="text-sm opacity-60">Thinking...</div>}
      </div>

      <div className="relative z-10 mt-4 flex gap-2">
        <input
          className="flex-1 rounded-lg border border-black/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/60 dark:border-white/20 dark:focus:border-white/60"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={loading}
        />
        <button
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          onClick={send}
          disabled={loading}
        >
          Send
        </button>
      </div>
    </main>
  );
}
