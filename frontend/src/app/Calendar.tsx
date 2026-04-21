"use client";

export type PlanSession = {
  day: string;
  start: string;
  end: string;
  session: string;
  group: string;
};

export type PlanCourse = {
  code: string;
  name: string;
  department: string;
  ects: number;
  sessions: PlanSession[];
};

export type Plan = {
  status: "exact" | "closest" | "infeasible" | "none";
  target_ects: number;
  total_ects: number;
  department: string | null;
  group: string | null;
  group_constraints: Record<string, string>;
  courses: PlanCourse[];
  reason?: string;
  absolute_max_ects?: number;
  alternative?: Plan & { relaxed?: string };
};

export type BusySlotView = {
  day: string;
  start: string;
  end: string;
  label?: string;
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;
const DAY_SHORT: Record<string, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
};
const START_MIN = 8 * 60; // 08:00
const END_MIN = 17 * 60; // 17:00
const SLOT_MIN = 30;
const TOTAL_SLOTS = (END_MIN - START_MIN) / SLOT_MIN; // 18 slots

// Tailwind pairs: [background, border, text]. Stable per course code.
const PALETTE = [
  "bg-sky-100/80 border-sky-300 text-sky-800",
  "bg-violet-100/80 border-violet-300 text-violet-800",
  "bg-amber-100/90 border-amber-300 text-amber-800",
  "bg-emerald-100/90 border-emerald-300 text-emerald-800",
  "bg-rose-100/80 border-rose-300 text-rose-800",
  "bg-cyan-100/80 border-cyan-300 text-cyan-800",
  "bg-fuchsia-100/80 border-fuchsia-300 text-fuchsia-800",
  "bg-lime-100/90 border-lime-300 text-lime-800",
];

function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

function colorFor(code: string): string {
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function statusLabel(plan: Plan): { text: string; tone: string } {
  if (plan.status === "exact")
    return {
      text: `Exact match: ${plan.total_ects} ECTS`,
      tone: "text-emerald-700",
    };
  if (plan.status === "closest")
    return {
      text: `Closest: ${plan.total_ects} / ${plan.target_ects} ECTS`,
      tone: "text-amber-700",
    };
  if (plan.status === "infeasible")
    return {
      text: `Infeasible${plan.reason ? `: ${plan.reason}` : ""}`,
      tone: "text-rose-700",
    };
  return { text: "No plan", tone: "text-slate-500" };
}

export function Calendar({
  plan,
  busySlots = [],
  onRebuild,
  rebuilding,
}: {
  plan: Plan | null;
  busySlots?: BusySlotView[];
  onRebuild?: () => void;
  rebuilding?: boolean;
}) {
  if (!plan && busySlots.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        Ask the agent for a schedule — the calendar will appear here.
      </div>
    );
  }

  const status = plan ? statusLabel(plan) : null;

  // Bucket sessions by day, with references to their course for coloring.
  type Block = {
    course: PlanCourse;
    session: PlanSession;
    startMin: number;
    endMin: number;
    conflict: boolean;
  };
  const byDay: Record<string, Block[]> = Object.fromEntries(DAYS.map((d) => [d, []]));
  const conflictingCodes = new Set<string>();
  if (plan) {
    for (const course of plan.courses) {
      for (const session of course.sessions) {
        if (!(session.day in byDay)) continue;
        const sStart = parseHHMM(session.start);
        const sEnd = parseHHMM(session.end);
        const clash = busySlots.some((b) => {
          if (b.day !== session.day) return false;
          const bStart = parseHHMM(b.start);
          const bEnd = parseHHMM(b.end);
          return sStart < bEnd && bStart < sEnd;
        });
        if (clash) conflictingCodes.add(course.code);
        byDay[session.day].push({
          course,
          session,
          startMin: sStart,
          endMin: sEnd,
          conflict: clash,
        });
      }
    }
  }

  type BusyBlock = {
    slot: BusySlotView;
    startMin: number;
    endMin: number;
  };
  const busyByDay: Record<string, BusyBlock[]> = Object.fromEntries(
    DAYS.map((d) => [d, []]),
  );
  for (const b of busySlots) {
    if (!(b.day in busyByDay)) continue;
    busyByDay[b.day].push({
      slot: b,
      startMin: parseHHMM(b.start),
      endMin: parseHHMM(b.end),
    });
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">Weekly plan</div>
          {status ? (
            <div className={`text-xs ${status.tone}`}>{status.text}</div>
          ) : (
            <div className="text-xs text-slate-500">
              Busy blocks only — ask the agent for a plan
            </div>
          )}
        </div>
        <div className="text-right text-xs text-slate-500">
          {plan?.department && <div>{plan.department}</div>}
          {plan?.group && <div>Group {plan.group}</div>}
          {plan &&
            Object.entries(plan.group_constraints ?? {}).map(([d, g]) => (
              <div key={d}>
                {d}: Group {g}
              </div>
            ))}
        </div>
      </header>

      {conflictingCodes.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <span>
            <span className="font-semibold">Conflict:</span>{" "}
            {Array.from(conflictingCodes).join(", ")} overlap your busy time.
          </span>
          {onRebuild && (
            <button
              type="button"
              onClick={onRebuild}
              disabled={rebuilding}
              className="rounded-lg bg-[#6e5192] px-3 py-1 text-xs font-medium text-white transition hover:bg-[#8b5cf6] disabled:opacity-50"
            >
              {rebuilding ? "Rebuilding…" : "Rebuild plan"}
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white">
        <div
          className="grid min-w-[520px] text-xs"
          style={{
            gridTemplateColumns: `56px repeat(${DAYS.length}, minmax(96px, 1fr))`,
            gridTemplateRows: `28px repeat(${TOTAL_SLOTS}, 24px)`,
          }}
        >
          {/* Day headers */}
          <div className="sticky top-0 z-20 border-b border-r border-slate-200 bg-white/90 backdrop-blur" />
          {DAYS.map((d, i) => (
            <div
              key={d}
              className="sticky top-0 z-20 flex items-center justify-center border-b border-slate-200 bg-white/90 font-semibold text-slate-700 backdrop-blur"
              style={{ gridColumn: i + 2, gridRow: 1 }}
            >
              {DAY_SHORT[d]}
            </div>
          ))}

          {/* Time rail */}
          {Array.from({ length: TOTAL_SLOTS }, (_, s) => {
            const min = START_MIN + s * SLOT_MIN;
            const hh = String(Math.floor(min / 60)).padStart(2, "0");
            const mm = String(min % 60).padStart(2, "0");
            const isHour = min % 60 === 0;
            return (
              <div
                key={`t-${s}`}
                className={`border-r border-slate-200 pr-1 text-right leading-none text-slate-500 ${
                  isHour ? "" : "opacity-0"
                }`}
                style={{ gridColumn: 1, gridRow: s + 2 }}
              >
                {isHour ? `${hh}:${mm}` : "."}
              </div>
            );
          })}

          {/* Empty day cells for grid lines */}
          {DAYS.map((_, di) =>
            Array.from({ length: TOTAL_SLOTS }, (_, s) => {
              const min = START_MIN + s * SLOT_MIN;
              const isHour = min % 60 === 0;
              return (
                <div
                  key={`c-${di}-${s}`}
                  className={`border-r border-slate-100 ${
                    isHour ? "border-t border-slate-200" : ""
                  }`}
                  style={{ gridColumn: di + 2, gridRow: s + 2 }}
                />
              );
            }),
          )}

          {/* Busy blocks (rendered beneath course blocks) */}
          {DAYS.flatMap((day, di) =>
            busyByDay[day].map((block, bi) => {
              const startSlot = Math.max(
                0,
                Math.floor((block.startMin - START_MIN) / SLOT_MIN),
              );
              const endSlot = Math.min(
                TOTAL_SLOTS,
                Math.ceil((block.endMin - START_MIN) / SLOT_MIN),
              );
              if (endSlot <= startSlot) return null;
              const rowStart = startSlot + 2;
              const rowEnd = endSlot + 2;
              return (
                <div
                  key={`busy-${di}-${bi}`}
                  className="m-0.5 overflow-hidden rounded-lg border border-slate-300 bg-slate-200/70 px-1.5 py-1 leading-tight text-slate-600"
                  style={{
                    gridColumn: di + 2,
                    gridRow: `${rowStart} / ${rowEnd}`,
                    backgroundImage:
                      "repeating-linear-gradient(45deg, rgba(100,116,139,0.18) 0 6px, transparent 6px 12px)",
                  }}
                  title={`Busy${block.slot.label ? ` — ${block.slot.label}` : ""}\n${block.slot.day} ${block.slot.start}-${block.slot.end}`}
                >
                  <div className="font-semibold">
                    {block.slot.label || "Busy"}
                  </div>
                  <div className="opacity-70">
                    {block.slot.start}–{block.slot.end}
                  </div>
                </div>
              );
            }),
          )}

          {/* Session blocks */}
          {DAYS.flatMap((day, di) =>
            byDay[day].map((block, bi) => {
              const startSlot = Math.max(0, Math.floor((block.startMin - START_MIN) / SLOT_MIN));
              const endSlot = Math.min(
                TOTAL_SLOTS,
                Math.ceil((block.endMin - START_MIN) / SLOT_MIN),
              );
              const rowStart = startSlot + 2;
              const rowEnd = endSlot + 2;
              const color = colorFor(block.course.code);
              return (
                <div
                  key={`b-${di}-${bi}`}
                  className={`m-0.5 overflow-hidden rounded-lg border px-1.5 py-1 leading-tight shadow-sm ${
                    block.conflict
                      ? "border-rose-400 bg-rose-100/80 text-rose-800 ring-2 ring-rose-300"
                      : color
                  }`}
                  style={{ gridColumn: di + 2, gridRow: `${rowStart} / ${rowEnd}` }}
                  title={`${block.course.code} — ${block.course.name}\n${block.session.day} ${block.session.start}-${block.session.end}\n${block.session.session}, Group ${block.session.group}${block.conflict ? "\n⚠ overlaps busy time" : ""}`}
                >
                  <div className="font-semibold">{block.course.code}</div>
                  <div className="truncate opacity-80">{block.session.session}</div>
                  <div className="opacity-70">
                    {block.session.start}–{block.session.end}
                  </div>
                </div>
              );
            }),
          )}
        </div>
      </div>

      {plan && plan.courses.length > 0 && (
        <ul className="grid max-h-40 grid-cols-1 gap-1 overflow-auto text-xs text-slate-700 sm:grid-cols-2">
          {plan.courses.map((c) => (
            <li key={c.code} className="flex items-center gap-2">
              <span
                className={`inline-block h-3 w-3 rounded-sm border ${colorFor(c.code)}`}
              />
              <span className="font-semibold text-slate-800">{c.code}</span>
              <span className="truncate text-slate-600">{c.name}</span>
              <span className="ml-auto rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                {c.ects} ECTS
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
