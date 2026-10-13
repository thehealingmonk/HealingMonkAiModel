import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';

// Renders a modal overlay straight into <body>. Inside the dashboard, <main> is
// its own `z-10` stacking context (under the sticky header/nav) and reveal
// animations put transforms on ancestors — either would cover or clip a
// `fixed inset-0` overlay rendered in place, cutting off the top of the form.
// Also locks page scroll behind the overlay; the overlay itself scrolls.
export default function ModalPortal({ children }: { children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(children, document.body);
}
