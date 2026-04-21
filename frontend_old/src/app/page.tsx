const mockMessages = [
  {
    role: "assistant",
    content:
      "Hi! Enter your information and I will suggest a study plan that matches your goals and calendar.",
  },
  {
    role: "user",
    content:
      "I want 24 ECTS, my specialization is software development, and I prefer daytime lectures.",
  },
  {
    role: "assistant",
    content:
      "Got it. I am now selecting courses that do not conflict with your existing Google Calendar.",
  },
];

const suggestionCards = [
  { name: "Algorithms", slot: "Mon 10:15-12:00", eap: 6 },
  { name: "Web Applications", slot: "Wed 12:15-14:00", eap: 6 },
  { name: "Databases", slot: "Thu 14:15-16:00", eap: 6 },
  { name: "Introduction to AI", slot: "Fri 10:15-12:00", eap: 6 },
];

export default function Home() {
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-700">Specialization</span>
                <input
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition focus:ring-2"
                  placeholder="e.g. Software Development"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-700">ECTS Goal</span>
                <input
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition focus:ring-2"
                  placeholder="24"
                  type="text"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-700">Completed Courses</span>
                <input
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition focus:ring-2"
                  placeholder="e.g. Programming Basics, Linear Algebra"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-700">Semester</span>
                <input
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition focus:ring-2"
                  placeholder="e.g. Spring 2026"
                />
              </label>

              <div className="flex items-end">
                <button className="w-full rounded-xl bg-[#6e5192] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#8b5cf6]">
                  Connect Google Calendar
                </button>
              </div>
            </div>
          </div>
        </header>

        <section className="grid min-h-0 flex-1 gap-4 px-4 pb-6 sm:px-6 lg:grid-cols-2 lg:px-8">
          <article className="flex min-h-[520px] flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/90 shadow-[0_10px_40px_rgba(30,41,59,0.09)]">
            <div className="border-b bg-[#6e5192] px-5 py-4">
              <h2 className="text-lg font-semibold text-white">Chat with Assistant</h2>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {mockMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "assistant"
                      ? "bg-slate-100 text-slate-700"
                      : "ml-auto bg-[#6e5192] text-white"
                  }`}
                >
                  {msg.content}
                </div>
              ))}
            </div>

            <div className="border-t border-slate-200 p-4">
              <div className="flex gap-2">
                <textarea
                  className="max-h-28 min-h-12 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-sky-200 transition focus:ring-2"
                  placeholder="e.g. I work on Tuesday from 14:00 to 18:00 and want 24 ECTS"
                />
                <button className="rounded-xl bg-[#6e5192] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#8b5cf6]">
                  Send
                </button>
              </div>
            </div>
          </article>

          <article className="flex min-h-[520px] flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/90 shadow-[0_10px_40px_rgba(30,41,59,0.09)]">
            <div className="border-b bg-[#6e5192] px-5 py-4">
              <h2 className="text-lg font-semibold text-white">Recommended Timetable</h2>
            </div>

            <div className="grid gap-4 p-5 xl:grid-cols-[1.05fr_1fr]">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Suggested Courses
                </h3>
                {suggestionCards.map((course) => (
                  <div
                    key={course.name}
                    className="rounded-2xl border border-slate-200 bg-white p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-slate-800">{course.name}</p>
                      <span className="rounded-lg bg-[#d3f4ff] px-2 py-1 text-xs font-semibold text-[#61aad5]">
                        {course.eap} ECTS
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{course.slot}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Google Calendar (visual)
                </h3>
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(160deg,#eff6ff_0%,#f8fafc_45%,#fef9c3_100%)] p-4">
                  <div className="mb-3 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">Weekly View</span>
                    <span className="rounded-md bg-white/80 px-2 py-1 text-xs text-slate-600">
                      Mock
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-2 text-[11px] text-slate-500">
                    {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
                      <div key={d} className="rounded-md bg-white/70 p-2 text-center font-medium">
                        {d}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-5 gap-2">
                    <div className="h-20 rounded-md bg-sky-100/80 p-2 text-[10px] text-sky-700">
                      10:15 Algorithms
                    </div>
                    <div className="h-20 rounded-md bg-white/80" />
                    <div className="h-20 rounded-md bg-violet-100/80 p-2 text-[10px] text-violet-700">
                      12:15 Web Apps
                    </div>
                    <div className="h-20 rounded-md bg-amber-100/90 p-2 text-[10px] text-amber-700">
                      14:15 Databases
                    </div>
                    <div className="h-20 rounded-md bg-emerald-100/90 p-2 text-[10px] text-emerald-700">
                      10:15 Intro to AI
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button className="w-full rounded-xl bg-[#6e5192] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#8b5cf6]">
                    Save
                  </button>
                  <button className="w-full rounded-xl bg-[#8598ae] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#8b5cf6]">
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}
