'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Smartphone, Copy, Check, Download, QrCode, Share2, AlertTriangle, ExternalLink } from 'lucide-react';
import { SITE_URL } from '@/lib/seo';

// The browser fires `beforeinstallprompt` on installable PWAs; we stash it so an
// "Install app" button can trigger the native prompt on demand.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const STORAGE_KEY = 'hm_app_url';

// A URL that only works on the same machine — no good for a shareable QR.
function isLocal(u: string): boolean {
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?|.*\.local)(:\d+)?/i.test(u.trim());
}

// Ensure a pasted domain becomes a clean absolute https URL (no trailing slash).
function normalizeUrl(v: string): string {
  let s = v.trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s.replace(/\/+$/, '');
}

// Best guess at the live URL: a configured public site URL wins, else the
// current origin — but never prefer a localhost value if we can avoid it.
function bestDefaultUrl(): string {
  const site = (SITE_URL || '').trim();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (site && !isLocal(site)) return site.replace(/\/+$/, '');
  if (origin && !isLocal(origin)) return origin;
  return site || origin;
}

// Dashboard card: shows a scannable QR + link so staff can open HealingMonk on
// their phone and install it as an app ("Add to Home Screen"). The URL is
// editable so a live domain can be entered even while testing on localhost.
export default function MobileAppCard() {
  const [url, setUrl] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);

  // Initialise the URL: a previously-saved live URL wins, else the best guess.
  useEffect(() => {
    let initial = '';
    try {
      initial = localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      /* storage may be unavailable */
    }
    setUrl(initial || bestDefaultUrl());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setCanInstall(false);
    };
    if (window.matchMedia?.('(display-mode: standalone)').matches) setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Regenerate the QR whenever the URL changes.
  useEffect(() => {
    if (!url) {
      setQr('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(url, { width: 512, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } })
      .then((d) => !cancelled && setQr(d))
      .catch(() => !cancelled && setQr(''));
    return () => {
      cancelled = true;
    };
  }, [url]);

  const commitUrl = (raw: string) => {
    const clean = normalizeUrl(raw);
    setUrl(clean);
    try {
      if (clean) localStorage.setItem(STORAGE_KEY, clean);
    } catch {
      /* ignore */
    }
  };

  const copy = () => {
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };

  const install = async () => {
    const d = deferred.current;
    if (!d) return;
    await d.prompt();
    await d.userChoice;
    deferred.current = null;
    setCanInstall(false);
  };

  const downloadQr = () => {
    if (!qr) return;
    const a = document.createElement('a');
    a.href = qr;
    a.download = 'healingmonk-app-qr.png';
    a.click();
  };

  const share = () => {
    if (navigator.share) navigator.share({ title: 'HealingMonk', url }).catch(() => {});
    else copy();
  };

  const local = url ? isLocal(url) : false;
  const insecure = url ? !/^https:\/\//i.test(url) && !local : false;

  return (
    <div className="glass-dark rounded-2xl p-5 sm:p-6" data-reveal>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        {/* QR */}
        <div className="mx-auto w-full max-w-[220px] shrink-0 sm:mx-0">
          <div className={`rounded-2xl bg-white p-3 shadow-lg shadow-black/20 ${local ? 'opacity-60' : ''}`}>
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="Scan to open HealingMonk on your phone" className="h-auto w-full rounded-lg" />
            ) : (
              <div className="flex aspect-square items-center justify-center text-slate-300">
                <QrCode className="h-10 w-10" />
              </div>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={downloadQr}
              disabled={!qr}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" /> Save QR
            </button>
            <a
              href={url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10 ${
                url ? '' : 'pointer-events-none opacity-50'
              }`}
              title="Open the link"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </a>
          </div>
        </div>

        {/* Text + actions */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20">
              <Smartphone className="h-5 w-5" />
            </span>
            <h3 className="text-lg font-semibold text-white">Get the mobile app</h3>
          </div>
          <p className="text-sm text-slate-400">
            Scan the QR with your phone camera to open HealingMonk, then add it to your home screen to use it like a
            native app — works on iPhone &amp; Android, fully responsive.
          </p>

          {/* Editable live URL + copy */}
          <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            App link (your live website URL)
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={(e) => commitUrl(e.target.value)}
              placeholder="https://your-clinic-domain.com"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-emerald-400/60"
            />
            <button
              onClick={copy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          {/* Warnings that would break install / QR sharing */}
          {local && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                This is a local address — it won&apos;t open on other phones. Deploy the site to a public HTTPS domain
                (or set <code className="text-amber-100">NEXT_PUBLIC_SITE_URL</code>), then paste that URL here.
              </span>
            </div>
          )}
          {insecure && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Use an <b>https://</b> URL — app install (Add to Home Screen) only works over HTTPS.</span>
            </div>
          )}

          {/* Primary actions */}
          <div className="mt-3 flex flex-wrap gap-2">
            {installed ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/20">
                <Check className="h-3.5 w-3.5" /> App installed
              </span>
            ) : canInstall ? (
              <button
                onClick={install}
                className="hm-lift inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30"
              >
                <Download className="h-4 w-4" /> Install app
              </button>
            ) : null}
            <button
              onClick={share}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"
            >
              <Share2 className="h-4 w-4" /> Share link
            </button>
          </div>

          {/* How-to */}
          <div className="mt-4 grid grid-cols-1 gap-2 text-xs text-slate-400 sm:grid-cols-2">
            <p>
              <span className="font-semibold text-slate-300">Android:</span> open the link in Chrome → menu ⋮ →
              <span className="text-slate-300"> Install app / Add to Home screen</span>.
            </p>
            <p>
              <span className="font-semibold text-slate-300">iPhone:</span> open in Safari → Share →
              <span className="text-slate-300"> Add to Home Screen</span>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
