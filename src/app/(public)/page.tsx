import Link from "next/link";

export default function Landing() {
  return (
    <div>
      <section className="bg-navy text-white">
        <div className="max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-glacier font-semibold mb-3" data-testid="landing-eyebrow">Banking that keeps its cool</p>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight" data-testid="landing-title">Everyday banking, made calm.</h1>
            <p className="mt-5 text-lg text-[#cfe4f5] max-w-lg">
              Chequing, savings, Interac e-Transfer, bill payments and more. Open an account in minutes.
            </p>
            <div className="mt-8 flex gap-3">
              <Link href="/register" className="ib-btn bg-glacier text-navy hover:bg-[#6bb5e3]" data-testid="landing-open-account">Open an account</Link>
              <Link href="/login" className="ib-btn border border-white/40 text-white hover:bg-white/10" data-testid="landing-signin">Sign in</Link>
            </div>
          </div>
          <div className="ib-card p-6 text-ink" aria-hidden>
            <p className="text-sm text-muted">Chequing 7919</p>
            <p className="text-3xl font-bold text-navy mt-1">$5,703.95</p>
            <div className="mt-6 space-y-3 text-sm">
              {[["Payroll deposit", "+$2,850.00"], ["Niagara Power Co", "-$141.05"], ["Frostbite Coffee", "-$6.52"]].map(([a, b]) => (
                <div key={a} className="flex justify-between border-b border-line pb-2"><span>{a}</span><span className="tabular-nums">{b}</span></div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-3 gap-6">
        {[
          ["Interac e-Transfer", "Send up to $3,000 a day to anyone with an email address, with autodeposit for instant arrival."],
          ["Bills on schedule", "Pay now or schedule weekly, biweekly or monthly payments. We skip weekends and holidays for you."],
          ["Mobile cheque deposit", "Snap the front and back. The first $100 is available right away."],
        ].map(([t, d]) => (
          <div key={t} className="ib-card p-6" data-testid="landing-feature">
            <h2 className="font-bold text-navy text-lg">{t}</h2>
            <p className="text-muted mt-2 text-sm">{d}</p>
          </div>
        ))}
      </section>
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="rounded-xl border border-warn/30 bg-warn-bg text-warn p-5 text-sm" data-testid="landing-disclaimer">
          <strong>Ice Bank is not a real bank.</strong> It is a practice application for learning software testing. Never enter real personal or
          financial information. Testers: see the <a className="ib-link" href="/swagger">API documentation</a> and open <a className="ib-link" href="/mail" target="_blank" rel="noopener">Ice Mail</a> to read one-time codes.
        </div>
      </section>
    </div>
  );
}
