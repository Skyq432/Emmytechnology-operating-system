'use client';

import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase';
import styles from './account-menu.module.css';

export default function AccountMenu({ name, roleLabel }: { name: string; roleLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function logout() {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace('/auth/login');
      router.refresh();
    });
  }

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.profileCard}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <div className={styles.profileAvatar}><UserRound size={18} /></div>
        <div className={styles.copy}>
          <strong>{name}</strong>
          <span>{roleLabel}</span>
        </div>
        <ChevronDown size={16} className={open ? styles.chevronOpen : styles.chevron} />
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.identity}>
            <strong>{name}</strong>
            <span>{roleLabel}</span>
          </div>
          <button type="button" role="menuitem" className={styles.logout} disabled={pending} onClick={logout}>
            <LogOut size={17} />
            <span>{pending ? 'Logging out…' : 'Log out'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
