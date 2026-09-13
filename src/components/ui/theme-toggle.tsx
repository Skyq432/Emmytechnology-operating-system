'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';

const STORAGE_KEY = 'emmytech-theme';

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

function getSnapshot(): boolean {
  return document.documentElement.classList.contains('dark');
}

function getServerSnapshot(): boolean {
  return false;
}

/** Toggles the `.dark` class set by the blocking init script in layout.tsx, and persists the choice. */
export function ThemeToggle({ className }: { className?: string }) {
  // useSyncExternalStore (rather than state + an effect) reads the DOM class
  // directly, so there's one source of truth and no SSR/client mismatch to sync.
  const dark = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
    } catch {
      // localStorage unavailable (private mode, etc.) — theme just won't persist across reloads.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={
        className ??
        'grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[11px] border border-slate-200 bg-white text-slate-500 transition hover:text-emmy-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
      }
    >
      {dark ? <Sun className="h-[17px] w-[17px]" /> : <Moon className="h-[17px] w-[17px]" />}
    </button>
  );
}
