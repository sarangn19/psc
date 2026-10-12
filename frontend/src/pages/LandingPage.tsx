import { Link } from 'react-router-dom';

const FEATURES = [
  { title: 'Adaptive practice', body: 'Cognix tracks which chapters you get wrong and keeps bringing them back until they stick.' },
  { title: 'Weak zone targeting', body: 'Every session is weighted toward your lowest-scoring chapters so you improve where it counts.' },
  { title: 'Chapter progress', body: 'Mark chapters learned and watch your coverage grow across LDC, VEO and other Kerala PSC exams.' },
  { title: 'Stats at a glance', body: 'Accuracy, streak, zone breakdown and session history — all in one place.' },
  { title: 'Current affairs', body: 'Daily news and PSC notifications, automatically fetched and summarised.' },
  { title: 'Learn mode', body: 'See exactly which concepts you missed most and jump straight to practice on that topic.' },
];

const EXAMS = ['LDC', 'LGS', 'VEO', 'Degree Prelims', 'PSC Plus Two', 'HSST'];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-app-bg flex flex-col" style={{ color: '#1A1F36', fontFamily: "'Anek Malayalam', system-ui, sans-serif" }}>
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-[10px]">
        <Link to="/" aria-label="Cognix home" className="flex items-center min-h-11 no-underline text-app-text">
          <span aria-hidden="true" className="inline-flex items-baseline text-[28px] font-[800] tracking-[-0.01em]" style={{ fontStretch: '78%' }}>
            C<span className="inline-block w-[14px] h-[14px] rounded-full bg-app-accent mx-[2px]" />gnix
          </span>
        </Link>
        <Link
          to="/login"
          className="flex items-center min-h-11 px-4 rounded-[10px] border border-[#C3C8D4] bg-white text-app-text no-underline text-[15px] font-[600]"
        >
          Log in
        </Link>
      </header>

      {/* Hero */}
      <section className="px-5 pt-7 flex flex-col gap-[18px]">
        <h1
          className="text-[48px] leading-[0.98] font-[800] tracking-[-0.015em] m-0"
          style={{ fontStretch: '75%' }}
        >
          Smarter preparation. Better results.
        </h1>
        <p className="text-[18px] leading-[1.45] text-app-textSecondary m-0">
          Adaptive practice for Kerala PSC exams. Cognix sees which chapters you get wrong and keeps bringing them back until they stick.
        </p>
        <div className="flex flex-col gap-[10px] mt-[6px]">
          <Link to="/register" className="btn-primary w-full">Get started — it's free</Link>
          <Link to="/login" className="btn-secondary w-full">I already have an account</Link>
        </div>
      </section>

      {/* Sample question card */}
      <section aria-label="A practice question in Cognix" className="px-5 pt-9">
        <div className="bg-white border border-app-border rounded-[6px] p-4 flex flex-col gap-[14px]">
          <div className="flex justify-between items-center gap-2 text-[13px] text-app-textSecondary">
            <span>Question 10 of 20</span>
            <span className="px-[10px] py-1 rounded-[999px] text-[13px] font-[600]" style={{ background: '#FBE8EC', color: '#A3263D' }}>Weak chapter</span>
          </div>
          <div className="grid gap-[6px] items-baseline" style={{ gridTemplateColumns: '36px minmax(0,1fr)' }}>
            <span aria-hidden="true" className="text-[32px] leading-[1] font-[800] text-app-accent" style={{ fontStretch: '75%' }}>10</span>
            <p className="text-[19px] font-[650] leading-[1.35] m-0">Who founded the SNDP Yogam in 1903?</p>
          </div>
          <div className="flex flex-col gap-2">
            {[
              { label: 'A', text: 'Ayyankali', kind: 'idle' },
              { label: 'B', text: 'Sree Narayana Guru', kind: 'right' },
              { label: 'C', text: 'Chattampi Swamikal', kind: 'idle' },
              { label: 'D', text: 'Vakkom Abdul Khader Moulavi', kind: 'idle' },
            ].map((opt) => (
              <div
                key={opt.label}
                className="flex items-center gap-3 min-h-[52px] px-3 rounded-[10px] border-[1.5px]"
                style={opt.kind === 'right'
                  ? { borderColor: '#2A3FC1', background: '#EEF1FD' }
                  : { borderColor: '#DADDE5', background: '#FFFFFF' }}
              >
                <span
                  aria-hidden="true"
                  className="flex-none w-8 h-8 rounded-full grid place-items-center text-[14px] font-[700]"
                  style={opt.kind === 'right'
                    ? { background: '#2A3FC1', color: '#FFFFFF' }
                    : { border: '2px solid #7A8095', color: '#4B5168' }}
                >
                  {opt.kind === 'right' ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  ) : opt.label}
                </span>
                <span className="flex-1 text-[16px]">{opt.text}</span>
                {opt.kind === 'right' && <span className="text-[13px] font-[650] text-app-accent">Correct</span>}
              </div>
            ))}
          </div>
          <p className="text-[15px] leading-[1.5] text-app-textSecondary m-0 border-t border-app-border pt-3">
            Sree Narayana Guru founded the SNDP Yogam in 1903, with Dr. Palpu as a key organiser. Kumaran Asan was its first secretary.
          </p>
        </div>
      </section>

      {/* Exams covered */}
      <section className="px-5 pt-16 flex flex-col gap-4">
        <h2 className="text-[30px] leading-[1.05] font-[800] m-0" style={{ fontStretch: '76%' }}>Exams we cover</h2>
        <div className="grid gap-[10px]" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
          {EXAMS.map((exam) => (
            <div key={exam} className="bg-white border border-app-border rounded-[6px] px-3 py-4 text-center">
              <span className="text-[18px] font-[800]" style={{ fontStretch: '76%' }}>{exam}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="px-5 pt-16 flex flex-col gap-4">
        <h2 className="text-[30px] leading-[1.05] font-[800] m-0" style={{ fontStretch: '76%' }}>Everything you need</h2>
        <ul className="list-none m-0 p-0 bg-white border border-app-border rounded-[6px]">
          {FEATURES.map((f, idx) => (
            <li
              key={f.title}
              className={`px-4 py-4 flex flex-col gap-1 ${idx < FEATURES.length - 1 ? 'border-b border-app-borderLight' : ''}`}
            >
              <span className="text-[16px] font-[700]">{f.title}</span>
              <span className="text-[14px] leading-[1.5] text-app-textSecondary">{f.body}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* CTA */}
      <section className="mx-5 mt-16 mb-8 rounded-[12px] p-[22px_20px_20px] flex flex-col gap-4" style={{ background: '#2A3FC1', color: '#FFFFFF' }}>
        <div className="flex flex-col gap-[6px]">
          <h2 className="text-[28px] leading-[1.05] font-[800] m-0" style={{ fontStretch: '76%', color: '#FFFFFF' }}>Start today</h2>
          <p className="text-[16px] leading-[1.45] m-0" style={{ color: '#DDE2FF' }}>
            Free forever. No credit card needed. Just pick your exam and go.
          </p>
        </div>
        <Link
          to="/register"
          className="flex items-center justify-content-center min-h-[52px] px-5 rounded-[10px] text-[17px] font-[700] no-underline text-center justify-center"
          style={{ background: '#FFFFFF', color: '#2A3FC1' }}
        >
          Create a free account
        </Link>
      </section>

      {/* Footer */}
      <footer className="px-5 pb-8 text-center text-[14px] text-app-textSecondary">
        <span aria-hidden="true" className="inline-flex items-baseline text-[20px] font-[800] tracking-[-0.01em] text-app-text mb-2" style={{ fontStretch: '78%' }}>
          C<span className="inline-block w-[10px] h-[10px] rounded-full bg-app-accent mx-[2px]" />gnix
        </span>
        <p className="m-0">Kerala PSC preparation, simplified.</p>
      </footer>
    </div>
  );
}
