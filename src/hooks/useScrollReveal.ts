import { useEffect } from 'react';

// AOS-style scroll reveal, dependency-free. Mount once near the app root.
// Any element with a `data-reveal` attribute fades/slides in the first time it
// enters the viewport. Because this is a single-page app, we also watch the DOM
// for newly-mounted elements (route changes, list re-renders) and observe them.
//
// Usage:
//   <div data-reveal>…</div>                         // slide up
//   <div data-reveal="fade">…</div>                  // fade only
//   <div data-reveal="scale">…</div>                 // pop in
//   <div data-reveal style={{ '--reveal-delay': '80ms' }}>…</div>  // stagger
export function useScrollReveal(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      document
        .querySelectorAll('[data-reveal]')
        .forEach((el) => el.classList.add('is-revealed'));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            io.unobserve(entry.target); // reveal once, then stop watching
          }
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -8% 0px' }
    );

    const scan = () => {
      document
        .querySelectorAll('[data-reveal]:not(.is-revealed)')
        .forEach((el) => io.observe(el));
    };

    scan();

    // Re-scan when the SPA swaps routes or lists re-render.
    const mo = new MutationObserver(() => scan());
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
}
