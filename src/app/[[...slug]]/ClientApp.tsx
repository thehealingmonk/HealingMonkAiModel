'use client';

import dynamic from 'next/dynamic';
import PWARegister from '@/components/common/PWARegister';

// The whole app is client-only (camera, MediaPipe WASM, react-router, browser
// storage), so we load it with ssr:false — Next never tries to render it on the
// server. ssr:false is only allowed inside a Client Component, which is why this
// wrapper exists between the server `page.tsx` and the SPA.
const AppShell = dynamic(() => import('@/features/router/AppShell'), {
  ssr: false,
  loading: () => (
    <div className="hm-splash" role="status" aria-label="Loading">
      <div className="hm-splash-ring" />
    </div>
  ),
});

export default function ClientApp() {
  return (
    <>
      <PWARegister />
      <AppShell />
    </>
  );
}
