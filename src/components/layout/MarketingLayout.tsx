import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import SiteNav from '@/components/layout/SiteNav';
import SiteFooter from '@/components/layout/SiteFooter';
import AiBackdrop from '@/components/common/AiBackdrop';

/**
 * Shared chrome for every public marketing page: the light "AI body-scan"
 * backdrop (animated), a fixed scroll-aware nav, and the footer. Child pages
 * render through <Outlet/>. Scrolls to top on route change so navigating feels
 * like a real website.
 */
export default function MarketingLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="light-base relative min-h-screen text-slate-800">
      {/* Site-wide animated AI scan backdrop. */}
      <AiBackdrop />

      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteNav />
        <main className="flex-1">
          <Outlet />
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
