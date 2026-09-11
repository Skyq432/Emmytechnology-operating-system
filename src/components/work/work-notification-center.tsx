'use client';

import Link from 'next/link';
import { Bell, CheckCheck, ClipboardCheck, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import styles from './work-notification-center.module.css';

type WorkNotification = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  task_id: string;
  task_assignment_id: string | null;
  notification_type: string;
  title: string;
  message: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

export default function WorkNotificationCenter({ currentUserId }: { currentUserId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [notifications, setNotifications] = useState<WorkNotification[]>([]);
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.filter((item) => !item.is_read).length;

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('work_notifications')
      .select('*')
      .eq('recipient_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(40);
    if (data) setNotifications(data as WorkNotification[]);
  }, [currentUserId, supabase]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`work-notifications:${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'work_notifications',
          filter: `recipient_id=eq.${currentUserId}`,
        },
        (payload) => {
          const next = payload.new as WorkNotification;
          setNotifications((items) => [next, ...items.filter((item) => item.id !== next.id)]);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, load, supabase]);

  async function markRead(id: string) {
    await supabase
      .from('work_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('recipient_id', currentUserId);
    setNotifications((items) => items.map((item) => item.id === id ? { ...item, is_read: true } : item));
  }

  async function markAllRead() {
    await supabase
      .from('work_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('recipient_id', currentUserId)
      .eq('is_read', false);
    setNotifications((items) => items.map((item) => ({ ...item, is_read: true })));
  }

  return (
    <div className={styles.root}>
      <button className={styles.bell} aria-label="Work notifications" onClick={() => setOpen((value) => !value)}>
        <Bell size={20} />
        {unreadCount > 0 && <span className={styles.count}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <div className={styles.panel}>
          <div className={styles.header}>
            <div>
              <strong>Work notifications</strong>
              <span>{unreadCount} unread</span>
            </div>
            <div className={styles.headerActions}>
              {unreadCount > 0 && <button onClick={() => void markAllRead()}><CheckCheck size={16} /> Mark all read</button>}
              <button aria-label="Close notifications" onClick={() => setOpen(false)}><X size={17} /></button>
            </div>
          </div>

          <div className={styles.list}>
            {notifications.length === 0 && <div className={styles.empty}><Bell size={24} /><span>No work notifications yet.</span></div>}
            {notifications.map((item) => (
              <Link
                key={item.id}
                href={`/modules/activities/tasks/${item.task_id}`}
                className={`${styles.item} ${!item.is_read ? styles.unread : ''}`}
                onClick={() => void markRead(item.id)}
              >
                <div className={styles.icon}><ClipboardCheck size={17} /></div>
                <div className={styles.copy}>
                  <strong>{item.title}</strong>
                  {item.message && <span>{item.message}</span>}
                  <small>{new Date(item.created_at).toLocaleString('en-NG')}</small>
                </div>
                {!item.is_read && <span className={styles.dot} />}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
