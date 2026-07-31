import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/store/auth.store';
import App from '@/features/router/AppRouter';
import { useScrollReveal } from '@/hooks/useScrollReveal';

// Client-side root for the SPA. Replaces the old Vite main.tsx: provides the
// router + auth context that App and every screen depend on. Mounted by Next
// via a dynamic ssr:false import (see app/[[...slug]]/ClientApp.tsx).
export default function AppShell() {
  // One global observer drives every `data-reveal` scroll animation across the
  // whole app (marketing site + all dashboards).
  useScrollReveal();
  return (
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  );
}
