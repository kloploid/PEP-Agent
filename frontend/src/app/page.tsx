"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Calendar, type Plan } from "./Calendar";
import {
  EMPTY_PROFILE,
  ProfileForm,
  type StudentProfile,
} from "./ProfileForm";

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
        className="rounded bg-slate-200 px-1 py-0.5 text-[0.85em] text-slate-700"
        {...props}
      />
    ),
  pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
    <pre
      className="overflow-x-auto rounded bg-slate-100 p-2 text-xs text-slate-700"
      {...props}
    />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      className="text-[#6e5192] underline underline-offset-2 hover:text-[#8b5cf6]"
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

function hasProfileData(p: StudentProfile): boolean {
  return (
    p.specialization !== null ||
    p.goal_ects !== null ||
    p.completed_codes.length > 0
  );
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [profile, setProfile] = useState<StudentProfile>(EMPTY_PROFILE);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const body: { messages: Message[]; student?: StudentProfile } = {
        messages: next,
      };
      if (hasProfileData(profile)) body.student = profile;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Request failed");
      setMessages([...next, { role: "assistant", content: data.reply }]);
      if (data.plan) setPlan(data.plan as Plan);
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
    <main className="min-h-dvh bg-slate-200 text-slate-900">
      <section className="flex min-h-dvh w-full flex-col gap-4">
        <header className="bg-[linear-gradient(90deg,#56367e_20%,#86d3ff_82%,#86d3ff_100%)] text-white shadow-[0_14px_50px_rgba(15,23,42,0.25)]">
          <div className="px-5 py-3">
            <p
              className="text-5xl font-semibold uppercase leading-[0.95] tracking-[0.2em] text-white/95"
              style={{ fontFamily: '"BBHBartle", "Avenir Next", "Segoe UI", sans-serif' }}
            >
              <span className="block">PEP</span>
              <span className="block">Assistant</span>
            </p>
          </div>

          <div className="bg-slate-200 px-5 py-4 text-slate-900">
            <ProfileForm value={profile} onChange={setProfile} />
          </div>
        </header>

        <section className="grid min-h-0 flex-1 gap-4 px-4 pb-6 sm:px-6 lg:grid-cols-2 lg:px-8">
          <article className="flex min-h-[520px] flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/90 shadow-[0_10px_40px_rgba(30,41,59,0.09)]">
            <div className="border-b bg-[#6e5192] px-5 py-4">
              <h2 className="text-lg font-semibold text-white">
                Chat with Assistant
              </h2>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {messages.length === 0 && (
                <div className="max-w-[92%] rounded-2xl bg-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-700">
                  Hi! Enter your information above and I&apos;ll suggest a study
                  plan that matches your goals and calendar.
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === "assistant"
                      ? "bg-slate-100 text-slate-700"
                      : "ml-auto bg-[#6e5192] text-white"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <div className="space-y-2">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={mdComponents}
                      >
                        {m.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="max-w-[92%] rounded-2xl bg-slate-100 px-4 py-3 text-sm italic text-slate-500">
                  Thinking…
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 p-4">
              <div className="flex gap-2">
                <textarea
                  className="max-h-28 min-h-12 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-sky-200 transition focus:ring-2"
                  placeholder="e.g. I work on Tuesday from 14:00 to 18:00 and want 24 ECTS"
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
                  className="rounded-xl bg-[#6e5192] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#8b5cf6] disabled:opacity-50"
                  onClick={send}
                  disabled={loading}
                >
                  Send
                </button>
              </div>
            </div>
          </article>

          <article className="flex min-h-[520px] flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/90 shadow-[0_10px_40px_rgba(30,41,59,0.09)]">
            <div className="border-b bg-[#6e5192] px-5 py-4">
              <h2 className="text-lg font-semibold text-white">
                Recommended Timetable
              </h2>
            </div>

            <div className="flex-1 overflow-auto p-5">
              <Calendar plan={plan} />
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}
