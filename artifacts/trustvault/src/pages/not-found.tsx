import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <main className="not-found-page">
      <Link href="/" className="brand-lockup" data-testid="link-not-found-brand">
        <span className="brand-mark"><ShieldAlert size={18} /></span><span>trustvault<span className="brand-period">.</span></span>
      </Link>
      <section className="not-found-card">
        <div className="not-found-code">404 <span>·</span> NOT FOUND</div>
        <div className="not-found-mark"><ShieldAlert size={25} /></div>
        <h1>This page isn’t in<br />your vault.</h1>
        <p>The address may have changed, or the page may no longer be available.</p>
        <Link href="/" className="tv-button tv-button-primary" data-testid="link-not-found-home"><ArrowLeft size={15} />Return to TrustVault</Link>
      </section>
      <div className="not-found-foot">PRIVATE ACCESS · VERIFIABLE HISTORY</div>
    </main>
  );
}
