'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, LockKeyhole, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function OsAdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError || !data.user) {
      setError(signInError?.message || 'Unable to sign in.');
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', data.user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      await supabase.auth.signOut();
      setError('This workspace is available to EmmyTech administrators only.');
      setLoading(false);
      return;
    }

    router.replace('/');
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f8ff] p-4">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.12)] sm:p-8">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-emmy-primary">
          <ArrowLeft className="h-4 w-4" />
          Back to EmmyTech OS
        </a>

        <img src="/emmytech-logo.png" alt="EmmyTech" className="mt-7 h-12 w-auto object-contain" />
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-emmy-primary">
          Marketing administration
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-slate-950">Admin sign in</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Use your EmmyTech administrator account to manage Ambassadors, leads and campaigns.
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Email address</span>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="pl-10"
                required
                autoComplete="email"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Password</span>
            <div className="relative">
              <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="pl-10"
                required
                autoComplete="current-password"
              />
            </div>
          </label>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign in to Marketing
          </Button>
        </form>
      </section>
    </main>
  );
}
