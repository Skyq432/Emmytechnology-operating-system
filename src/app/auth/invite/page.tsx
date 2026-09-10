'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Link2, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type InviteLink = {
  code: string;
  role: string | null;
  status: string;
  max_uses: number | null;
  used_count: number | null;
  expires_at: string | null;
};

export default function InviteRegisterPage() {
  const [code, setCode] = useState<string | null>(null);
  const [codeLoaded, setCodeLoaded] = useState(false);
  const [validating, setValidating] = useState(true);
  const [valid, setValid] = useState(false);
  const [inviteData, setInviteData] = useState<InviteLink | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [registering, setRegistering] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code')?.trim() || null;
    setCode(codeParam);
    setCodeLoaded(true);
  }, []);

  useEffect(() => {
    if (!codeLoaded) return;

    const validateCode = async () => {
      if (!code) {
        setError('No invite code provided');
        setValidating(false);
        return;
      }

      try {
        const supabase = createClient();
        const { data, error: inviteError } = await supabase
          .from('invite_links')
          .select('code, role, status, max_uses, used_count, expires_at')
          .eq('code', code)
          .eq('status', 'active')
          .single();

        if (inviteError || !data) {
          setError('Invalid or expired invite code');
          return;
        }

        if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
          setError('This invite link has expired');
          return;
        }

        if (data.max_uses !== null && (data.used_count ?? 0) >= data.max_uses) {
          setError('This invite link has reached its maximum uses');
          return;
        }

        setInviteData(data as InviteLink);
        setValid(true);
        setError(null);
      } catch {
        setError('Failed to validate invite code');
      } finally {
        setValidating(false);
      }
    };

    void validateCode();
  }, [codeLoaded, code]);

  const handleRegister = async () => {
    const cleanName = name.trim();
    const cleanEmail = email.trim();

    if (!cleanEmail || !password || !cleanName || !valid || !inviteData || !code) return;

    setRegistering(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: cleanName,
            role: inviteData?.role || 'ambassador',
            invite_code: code,
          },
        },
      });

      if (authError) throw authError;
      setSuccess(true);
    } catch (registrationError) {
      setError(registrationError instanceof Error ? registrationError.message : 'Unable to create account');
    } finally {
      setRegistering(false);
    }
  };

  if (validating) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f8ff] p-4">
        <div className="flex items-center gap-2 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          <p>Validating invite code...</p>
        </div>
      </main>
    );
  }

  if (!valid) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f8ff] p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-red-500" />
            <h1 className="mb-2 text-xl font-bold">Invalid Invite</h1>
            <p className="mb-4 text-red-600">{error}</p>
            <p className="text-sm text-muted-foreground">Please contact an admin to get a valid invite link.</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (success) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f8ff] p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <Check className="mx-auto mb-4 h-12 w-12 text-emerald-500" />
            <h1 className="mb-2 text-xl font-bold">Registration Successful!</h1>
            <p className="mb-4 text-muted-foreground">Please check your email to verify your account.</p>
            <Button onClick={() => { window.location.href = '/auth/login'; }}>Go to Login</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f8ff] p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <img src="/emmytech-logo.png" alt="EmmyTech" className="mb-4 h-10 w-auto object-contain" />
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Join EmmyTech Ambassador
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-emmy-primary/5 p-3">
            <div className="flex items-center gap-2 text-sm">Invite Code: <Badge variant="secondary">{code}</Badge></div>
            <p className="mt-1 text-xs text-muted-foreground">Role: {inviteData?.role || 'ambassador'}</p>
          </div>

          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="invite-full-name">Full Name</label>
            <Input id="invite-full-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" autoComplete="name" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="invite-email">Email</label>
            <Input id="invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="invite-password">Password</label>
            <Input id="invite-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 6 characters" minLength={6} autoComplete="new-password" />
          </div>

          <Button onClick={handleRegister} disabled={registering || !email.trim() || password.length < 6 || !name.trim()} className="w-full">
            {registering ? 'Creating Account...' : 'Create Account'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <a href="/auth/login" className="text-emmy-primary hover:underline">Login</a>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
