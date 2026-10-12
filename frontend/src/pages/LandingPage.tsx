import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Library,
  ListChecks,
  LogIn,
  Menu,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Sparkles,
    title: 'AI-Powered Learning',
    body: 'Personalised assistance to help learners understand and navigate their preparation.',
  },
  {
    icon: ListChecks,
    title: 'Practice & Quizzes',
    body: 'Practice with exam-oriented questions and quiz-based learning.',
  },
  {
    icon: RefreshCw,
    title: 'Smart Revision',
    body: 'Revisit important concepts and questions efficiently, right when they matter.',
  },
  {
    icon: BarChart3,
    title: 'Progress Tracking',
    body: 'A clear view of your preparation and performance over time.',
  },
  {
    icon: Library,
    title: 'Study Resources',
    body: 'Notes, questions, flashcards and learning resources, organised in one place.',
  },
  {
    icon: Target,
    title: 'Personalized Preparation',
    body: 'A focused preparation experience shaped around your goals and needs.',
  },
];

const STEPS = [
  { num: '01', icon: BookOpen, title: 'Learn', body: 'Understand concepts and study resources.' },
  { num: '02', icon: ListChecks, title: 'Practice', body: 'Test your knowledge with questions and quizzes.' },
  { num: '03', icon: RefreshCw, title: 'Revise', body: 'Revisit important concepts and mistakes.' },
  { num: '04', icon: TrendingUp, title: 'Improve', body: 'Track progress and continuously improve.' },
];

const PILLARS = ['Learning', 'Practice', 'Revision', 'Progress tracking', 'AI-assisted preparation'];

function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'w-11 h-11 text-lg rounded-2xl' : size === 'sm' ? 'w-7 h-7 text-xs rounded-lg' : 'w-9 h-9 text-sm rounded-xl';
  return (
    <span
      aria-hidden="true"
      className={`${dims} bg-gradient-to-br bg-app-accent text-white font-bold grid place-items-center select-none`}
    >
      C
    </span>
  );
}

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

/* ---------------------------------------------------------------
   Product preview mockups — built from the real app's design
   tokens and component styles. Illustrative UI only: no user
   counts, no performance claims, no invented metrics.
--------------------------------------------------------------- */

function QuizMock() {
  const options = ['Periyar', 'Pamba', 'Bharathapuzha', 'Chaliyar'];
  return (
    <div className="card-elevated overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-100 text-amber-700 border border-amber-200">MEDIUM</span>
          <span className="text-[10px] font-medium px-2 py-1 rounded-lg bg-app-accentMuted text-app-accentDark border border-app-accent/20">Geography · Rivers</span>
        </div>
        <span className="text-[10px] text-app-textMuted">Question 4 of 10</span>
      </div>

      <p className="text-app-text font-semibold text-[15px] leading-snug mb-4">
        Which is the longest river in Kerala?
      </p>

      <div className="space-y-2">
        {options.map((o, i) => {
          const isCorrect = i === 0;
          return (
            <div
              key={o}
              className={`flex items-center justify-between gap-3 p-3 rounded-xl border text-sm transition-all ${
                isCorrect
                  ? 'bg-emerald-50 border-emerald-300 text-app-text'
                  : 'bg-app-surface border-app-border text-app-textSecondary'
              }`}
            >
              <span className="flex items-center gap-3">
                <span
                  className={`w-7 h-7 rounded-lg grid place-items-center text-xs font-bold shrink-0 ${
                    isCorrect ? 'bg-emerald-500 text-white' : 'bg-white border border-app-border text-app-textMuted'
                  }`}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                {o}
              </span>
              {isCorrect && <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />}
            </div>
          );
        })}
      </div>

      <div className="mt-4 p-3 rounded-xl bg-app-accentMuted border border-app-accent/20 text-xs text-app-textSecondary leading-relaxed">
        <span className="font-semibold text-app-text">Explanation</span> — Periyar, at about 244 km, is the longest river flowing through Kerala.
      </div>

      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="mt-4 w-full py-3 rounded-xl bg-app-accent text-white text-sm font-semibold shadow-sm pointer-events-none"
      >
        Next Question →
      </button>
    </div>
  );
}

function LearningMock() {
  const rows = [
    { name: 'Indian History', level: 'CONCEPT', zone: 'STRONG', tone: 'emerald' },
    { name: 'Rivers of Kerala', level: 'CONCEPT', zone: 'WEAK', tone: 'rose' },
    { name: 'Constitution Basics', level: 'TOPIC', zone: 'MEDIUM', tone: 'amber' },
  ] as const;

  return (
    <div className="card-elevated h-full">
      <div className="flex items-center gap-2 mb-4">
        <Target size={15} className="text-app-accent" />
        <h4 className="text-sm font-semibold text-app-text">Learning</h4>
      </div>

      <p className="text-[11px] text-app-textMuted mb-3 truncate">History › Modern India › Freedom Struggle</p>

      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.name} className="p-3 rounded-xl bg-app-surface border border-app-border">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white border border-app-border text-app-textMuted">{r.level}</span>
              <span
                className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  r.tone === 'emerald'
                    ? 'bg-emerald-100 text-emerald-700'
                    : r.tone === 'rose'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {r.zone}
              </span>
            </div>
            <p className="text-xs font-medium text-app-text">{r.name}</p>
            <div className="mt-2 h-1.5 rounded-full bg-app-border overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  r.tone === 'emerald' ? 'bg-emerald-500 w-4/5' : r.tone === 'rose' ? 'bg-rose-500 w-1/4' : 'bg-amber-500 w-1/2'
                }`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressMock() {
  const bars = [
    { d: 'Mon', h: 'h-8' },
    { d: 'Tue', h: 'h-14' },
    { d: 'Wed', h: 'h-10' },
    { d: 'Thu', h: 'h-16' },
    { d: 'Fri', h: 'h-12' },
    { d: 'Sat', h: 'h-20' },
    { d: 'Sun', h: 'h-11' },
  ];
  return (
    <div className="card-elevated h-full">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={15} className="text-app-accent" />
        <h4 className="text-sm font-semibold text-app-text">Progress</h4>
      </div>

      <div className="flex items-end justify-between gap-2 h-24 px-1">
        {bars.map((b) => (
          <div key={b.d} className="flex-1 flex flex-col items-center gap-2">
            <div className={`w-full max-w-[26px] rounded-md bg-app-accent ${b.h}`} />
            <span className="text-[9px] text-app-textMuted">{b.d}</span>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        <div>
          <div className="flex justify-between text-[11px] mb-1.5">
            <span className="text-app-textSecondary">Kerala History</span>
            <span className="text-emerald-700 font-semibold">STRONG</span>
          </div>
          <div className="h-1.5 rounded-full bg-app-surface overflow-hidden">
            <div className="h-full w-4/5 rounded-full bg-emerald-500" />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[11px] mb-1.5">
            <span className="text-app-textSecondary">Geography</span>
            <span className="text-amber-700 font-semibold">MEDIUM</span>
          </div>
          <div className="h-1.5 rounded-full bg-app-surface overflow-hidden">
            <div className="h-full w-1/2 rounded-full bg-amber-500" />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[11px] mb-1.5">
            <span className="text-app-textSecondary">Quantitative Aptitude</span>
            <span className="text-rose-700 font-semibold">WEAK</span>
          </div>
          <div className="h-1.5 rounded-full bg-app-surface overflow-hidden">
            <div className="h-full w-1/4 rounded-full bg-rose-500" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.title = 'Cognix — Smarter Preparation for Competitive Exams';
  }, []);

  const nav = [
    { id: 'features', label: 'Features' },
    { id: 'how-it-works', label: 'How it works' },
    { id: 'preview', label: 'Preview' },
  ];

  return (
    <div className="min-h-screen bg-app-bg text-app-text" id="top">
      {/* ------------------------------------------------ Header */}
      <header className="sticky top-0 z-50 bg-app-bg/85 backdrop-blur-lg border-b border-app-border">
        <nav aria-label="Main navigation" className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <a href="#top" className="flex items-center gap-2.5 shrink-0" aria-label="Cognix home">
            <Logo size="sm" />
            <span className="font-semibold tracking-tight">Cognix</span>
          </a>

          <div className="hidden md:flex items-center gap-1">
            {nav.map((n) => (
              <button
                key={n.id}
                onClick={() => scrollToSection(n.id)}
                className="px-3 py-2 rounded-xl text-sm text-app-textSecondary hover:text-app-text hover:bg-app-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
              >
                {n.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium text-app-textSecondary hover:text-app-text hover:bg-app-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
            >
              <LogIn size={14} />
              Sign in
            </Link>
            <Link to="/login" className="btn-primary text-sm px-4 py-2 hidden sm:inline-flex">
              Start Preparing
            </Link>
            <button
              type="button"
              className="md:hidden p-2 rounded-xl text-app-textSecondary hover:bg-app-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </nav>

        {menuOpen && (
          <div className="md:hidden border-t border-app-border bg-app-bg px-4 py-3 space-y-1">
            {nav.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  setMenuOpen(false);
                  scrollToSection(n.id);
                }}
                className="block w-full text-left px-3 py-2.5 rounded-xl text-sm text-app-textSecondary hover:bg-app-surface hover:text-app-text transition-colors"
              >
                {n.label}
              </button>
            ))}
            <Link
              to="/login"
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-2.5 rounded-xl text-sm text-app-textSecondary hover:bg-app-surface hover:text-app-text transition-colors"
            >
              Sign in
            </Link>
            <Link
              to="/login"
              onClick={() => setMenuOpen(false)}
              className="btn-primary block text-center text-sm mt-2"
            >
              Start Preparing
            </Link>
          </div>
        )}
      </header>

      <main>
        {/* ------------------------------------------------ Hero */}
        <section aria-labelledby="hero-heading" className="relative overflow-hidden">
          {/* Decorative glows */}
          <div aria-hidden="true" className="pointer-events-none absolute -top-40 -right-32 w-[480px] h-[480px] bg-app-accent/10 rounded-full blur-[120px]" />
          <div aria-hidden="true" className="pointer-events-none absolute top-40 -left-40 w-[420px] h-[420px] bg-app-accent/5 rounded-full blur-[120px]" />

          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-20 sm:pt-24 sm:pb-28 grid lg:grid-cols-2 gap-14 items-center">
            <div className="animate-fade-up">
              <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-app-accentDark bg-app-accentMuted border border-app-accent/20 rounded-full px-3.5 py-1.5">
                <Sparkles size={12} />
                AI-powered preparation platform
              </span>

              <h1 id="hero-heading" className="mt-6 text-4xl sm:text-5xl lg:text-[3.4rem] font-bold leading-[1.08] tracking-tight">
                Smarter Preparation.
                <br />
                <span className="text-app-accent">
                  Better Results.
                </span>
              </h1>

              <p className="mt-5 text-base sm:text-lg text-app-textSecondary leading-relaxed max-w-xl">
                Cognix brings learning, practice, revision, and progress tracking into one intelligent preparation platform for competitive exams.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/login" className="btn-primary inline-flex items-center gap-2 px-6 py-3.5 text-base">
                  Start Preparing
                  <ArrowRight size={17} />
                </Link>
                <button
                  type="button"
                  onClick={() => scrollToSection('features')}
                  className="btn-secondary inline-flex items-center gap-2 px-6 py-3.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
                >
                  Explore Cognix
                </button>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-app-textMuted">
                {['Adaptive practice', 'Smart revision', 'Progress insights'].map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-app-accent" />
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Hero product visual */}
            <div className="relative animate-fade-up [animation-delay:150ms]">
              <div
                aria-hidden="true"
                className="absolute -inset-6 bg-gradient-to-br from-app-accent/10 via-transparent to-app-accent/5 rounded-[2.5rem] blur-xl"
              />
              <div className="relative">
                <QuizMock />
                <div className="hidden sm:flex absolute -left-5 -bottom-6 items-center gap-2.5 bg-white border border-app-border rounded-2xl px-4 py-3 shadow-md animate-float">
                  <span className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 grid place-items-center">
                    <Target size={15} />
                  </span>
                  <span className="text-xs leading-tight">
                    <span className="block font-semibold text-app-text">Weak concept focus</span>
                    <span className="text-app-textMuted">Practice what needs work</span>
                  </span>
                </div>
                <div className="hidden sm:flex absolute -right-4 -top-5 items-center gap-2.5 bg-white border border-app-border rounded-2xl px-4 py-3 shadow-md animate-float [animation-delay:800ms]">
                  <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 grid place-items-center">
                    <TrendingUp size={15} />
                  </span>
                  <span className="text-xs leading-tight">
                    <span className="block font-semibold text-app-text">Track progress</span>
                    <span className="text-app-textMuted">See how you improve</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ What is Cognix */}
        <section aria-labelledby="about-heading" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-app-accent">What is Cognix</p>
            <h2 id="about-heading" className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight">
              Everything You Need to Prepare Smarter
            </h2>
            <p className="mt-4 text-app-textSecondary leading-relaxed">
              Cognix combines learning, practice, revision and progress tracking into a single, organised preparation experience — with AI-assisted tools that help you stay focused on what matters most.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-2.5">
            {PILLARS.map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-2 text-sm font-medium text-app-textSecondary bg-white border border-app-border rounded-full px-4 py-2"
              >
                <CheckCircle2 size={14} className="text-app-accent" />
                {p}
              </span>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------ Features */}
        <section id="features" aria-labelledby="features-heading" className="scroll-mt-20 border-y border-app-border bg-app-surface">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-app-accent">Features</p>
              <h2 id="features-heading" className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight">
                Built for the way you prepare
              </h2>
            </div>

            <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {FEATURES.map((f, i) => {
                const Icon = f.icon;
                return (
                  <article
                    key={f.title}
                    className="group card hover:border-app-accent/40 hover:shadow-md transition-all duration-300 animate-fade-up"
                    style={{ animationDelay: `${i * 70}ms` }}
                  >
                    <span className="inline-grid place-items-center w-11 h-11 rounded-xl bg-app-accentMuted border border-app-accent/20 text-app-accentDark group-hover:bg-app-accent group-hover:text-white transition-colors">
                      <Icon size={20} />
                    </span>
                    <h3 className="mt-4 font-semibold text-app-text">{f.title}</h3>
                    <p className="mt-2 text-sm text-app-textSecondary leading-relaxed">{f.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ How it works */}
        <section id="how-it-works" aria-labelledby="how-heading" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20 scroll-mt-20">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-app-accent">How it works</p>
            <h2 id="how-heading" className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight">
              A simple loop that keeps you improving
            </h2>
          </div>

          <ol className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <li
                  key={s.num}
                  className="relative card animate-fade-up"
                  style={{ animationDelay: `${i * 90}ms` }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-3xl font-bold text-app-accent/30 tabular-nums">{s.num}</span>
                    <span className="w-10 h-10 rounded-xl bg-app-surface border border-app-border text-app-accent grid place-items-center">
                      <Icon size={18} />
                    </span>
                  </div>
                  <h3 className="mt-4 font-semibold text-app-text">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-app-textSecondary leading-relaxed">{s.body}</p>
                </li>
              );
            })}
          </ol>
        </section>

        {/* ------------------------------------------------ Product preview */}
        <section id="preview" aria-labelledby="preview-heading" className="scroll-mt-20 border-y border-app-border bg-app-surface">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-app-accent">Product preview</p>
              <h2 id="preview-heading" className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight">
                See Cognix in action
              </h2>
              <p className="mt-4 text-app-textSecondary leading-relaxed">
                A closer look at the practice, learning and progress experience inside the app.
              </p>
            </div>

            <div className="mt-10 grid lg:grid-cols-3 gap-4 sm:gap-5">
              <div className="lg:col-span-1">
                <QuizMock />
              </div>
              <div>
                <LearningMock />
              </div>
              <div>
                <ProgressMock />
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ PSC focus */}
        <section aria-labelledby="focus-heading" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid lg:grid-cols-2 gap-10 items-start">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-app-accent">Current focus</p>
              <h2 id="focus-heading" className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight">
                Built for focused exam preparation
              </h2>
              <p className="mt-4 text-app-textSecondary leading-relaxed">
                Cognix currently focuses on Kerala PSC preparation, bringing structured practice, revision and intelligent learning tools into one focused experience.
              </p>
              <p className="mt-3 text-app-textSecondary leading-relaxed">
                The platform is designed to grow beyond a single exam — positioned to support additional competitive examinations over time.
              </p>
              <p className="mt-6 text-xs text-app-textMuted leading-relaxed">
                Cognix is an independent preparation platform and is not affiliated with, endorsed by, or sponsored by Kerala PSC or any government body.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="card">
                <span className="inline-grid place-items-center w-11 h-11 rounded-xl bg-app-accentMuted border border-app-accent/20 text-app-accentDark">
                  <BookOpen size={20} />
                </span>
                <h3 className="mt-4 font-semibold text-app-text">Kerala PSC</h3>
                <p className="mt-2 text-sm text-app-textSecondary leading-relaxed">
                  The current focus — structured chapters, exam-oriented questions and revision tools.
                </p>
                <span className="mt-4 inline-block text-[10px] font-bold uppercase tracking-wider text-app-accentDark bg-app-accentMuted border border-app-accent/20 rounded-full px-2.5 py-1">
                  Available now
                </span>
              </div>
              <div className="card border-dashed">
                <span className="inline-grid place-items-center w-11 h-11 rounded-xl bg-app-surface border border-app-border text-app-textMuted">
                  <Target size={20} />
                </span>
                <h3 className="mt-4 font-semibold text-app-text">More exams</h3>
                <p className="mt-2 text-sm text-app-textSecondary leading-relaxed">
                  The same system is built to extend to additional competitive examinations.
                </p>
                <span className="mt-4 inline-block text-[10px] font-bold uppercase tracking-wider text-app-textMuted bg-app-surface border border-app-border rounded-full px-2.5 py-1">
                  Designed to expand
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ Final CTA */}
        <section aria-labelledby="cta-heading" className="relative overflow-hidden border-t border-app-border">
          <div aria-hidden="true" className="pointer-events-none absolute left-1/2 -translate-x-1/2 -bottom-52 w-[600px] h-[400px] bg-app-accent/10 rounded-full blur-[130px]" />
          <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-20 sm:py-24 text-center">
            <h2 id="cta-heading" className="text-2xl sm:text-4xl font-bold tracking-tight">
              Start Your Preparation with Cognix
            </h2>
            <p className="mt-4 text-app-textSecondary text-base sm:text-lg">
              Turn scattered preparation into a focused learning system.
            </p>
            <div className="mt-8">
              <Link to="/login" className="btn-primary inline-flex items-center gap-2 px-8 py-4 text-base">
                Start Preparing
                <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ------------------------------------------------ Footer */}
      <footer className="border-t border-app-border bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-8">
            <div className="max-w-xs">
              <div className="flex items-center gap-2.5">
                <Logo size="sm" />
                <span className="font-semibold tracking-tight">Cognix</span>
              </div>
              <p className="mt-3 text-sm text-app-textSecondary leading-relaxed">
                Intelligent preparation for competitive exams.
              </p>
            </div>

            <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <a href="#top" className="text-app-textSecondary hover:text-app-text transition-colors">
                Home
              </a>
              <Link to="/login" className="text-app-textSecondary hover:text-app-text transition-colors">
                Login
              </Link>
            </nav>
          </div>

          <div className="mt-10 pt-6 border-t border-app-border flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <p className="text-xs text-app-textMuted">© {new Date().getFullYear()} Cognix</p>
            <p className="text-xs text-app-textMuted">Kerala PSC · Competitive exam preparation</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
