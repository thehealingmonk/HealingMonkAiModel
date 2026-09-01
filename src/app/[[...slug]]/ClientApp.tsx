'use client';

import dynamic from 'next/dynamic';
import PWARegister from '@/components/common/PWARegister';
import { FloatingInstallButton } from '@/components/common/InstallAppButton';

// The whole app is client-only (camera, MediaPipe WASM, react-router, browser
// storage), so we load it with ssr:false — Next never tries to render it on the
// server. ssr:false is only allowed inside a Client Component, which is why this
// wrapper exists between the server `page.tsx` and the SPA.
const AppShell = dynamic(() => import('@/features/router/AppShell'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-[#f6faf8]">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-500" />
    </div>
  ),
});

export default function ClientApp() {
  return (
    <>
      <PWARegister />
      <AppShell />
      <FloatingInstallButton />
    </>
  );
}
