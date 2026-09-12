'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, Link2, MapPin, ShieldCheck, UserCog, UsersRound } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { ROLE_LABELS, type EmmyRole, type InternalRole } from '@/lib/auth/roles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';

type StaffRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string | null;
  default_location_id: string | null;
};

type StaffLocation = {
  id: string;
  code: string;
  name: string;
};

const STAFF_INVITE_ROLES: InternalRole[] = [
  'super_admin',
  'growth_lead',
  'marketing_manager',
  'front_desk',
  'operations_lead',
  'technician',
  'sales_analyst',
];

const STAFF_ASSIGNABLE_ROLES: InternalRole[] = [
  'super_admin',
  'admin',
  'growth_lead',
  'marketing_manager',
  'front_desk',
  'operations_lead',
  'technician',
  'sales_analyst',
];

export function StaffAdmin({
  initialStaff,
  locations,
  currentRole,
  currentUserId,
}: {
  initialStaff: StaffRow[];
  locations: StaffLocation[];
  currentRole: InternalRole;
  currentUserId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [staff, setStaff] = useState(initialStaff);
  const [inviteRole, setInviteRole] = useState<InternalRole>('front_desk');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const generateInvite = async () => {
    setBusy('invite');
    setMessage(null);
    setInviteCode(null);

    const { data, error } = await supabase.rpc('generate_invite_link_for_role', {
      p_role: inviteRole,
      p_max_uses: 1,
      p_expiry_days: 7,
    });

    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setInviteCode(data as string);
      setMessage(`${ROLE_LABELS[inviteRole]} invitation created.`);
    }
    setBusy(null);
  };

  const copyInvite = async () => {
    if (!inviteCode) return;
    const fullLink = `${window.location.origin}/auth/invite?code=${inviteCode}`;
    await navigator.clipboard.writeText(fullLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const changeRole = async (userId: string, nextRole: InternalRole) => {
    const previous = staff.find((member) => member.id === userId)?.role;
    if (!previous || previous === nextRole) return;

    const busyKey = `role:${userId}`;
    setBusy(busyKey);
    setMessage(null);
    setStaff((rows) => rows.map((row) => row.id === userId ? { ...row, role: nextRole } : row));

    const { error } = await supabase.rpc('set_staff_role', {
      p_user_id: userId,
      p_role: nextRole,
    });

    if (error) {
      setStaff((rows) => rows.map((row) => row.id === userId ? { ...row, role: previous } : row));
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage(`Role updated to ${ROLE_LABELS[nextRole]}.`);
    }
    setBusy(null);
  };

  const changeLocation = async (userId: string, locationId: string) => {
    const previous = staff.find((member) => member.id === userId)?.default_location_id ?? null;
    const nextLocation = locationId || null;
    if (previous === nextLocation) return;

    const busyKey = `location:${userId}`;
    setBusy(busyKey);
    setMessage(null);
    setStaff((rows) => rows.map((row) => row.id === userId ? { ...row, default_location_id: nextLocation } : row));

    const { error } = await supabase.rpc('set_staff_default_location', {
      p_user_id: userId,
      p_location_id: nextLocation,
    });

    if (error) {
      setStaff((rows) => rows.map((row) => row.id === userId ? { ...row, default_location_id: previous } : row));
      setMessage(`Error: ${error.message}`);
    } else {
      const branch = locations.find((location) => location.id === nextLocation);
      setMessage(branch ? `Default branch updated to ${branch.name}.` : 'Default branch cleared.');
    }
    setBusy(null);
  };

  return (
    <main className="min-h-screen bg-[#f7f9fc] p-4 md:p-7">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#073995]">Administration</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">Staff & Access</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Invite EmmyTech staff, control their operational role, and assign the branch their customer work belongs to.
            </p>
          </div>
          <Badge variant="secondary" className="w-fit">{ROLE_LABELS[currentRole as EmmyRole]}</Badge>
        </header>

        {message && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${message.startsWith('Error:') ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {message}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" /> Invite Staff</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Role for this invitation</span>
                <Select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as InternalRole)}>
                  {STAFF_INVITE_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                </Select>
                <span className="mt-2 block text-xs text-slate-500">Single use · expires in 7 days · role is locked to the invite.</span>
              </label>
              <Button onClick={() => void generateInvite()} disabled={busy === 'invite'} className="gap-2">
                <ShieldCheck className="h-4 w-4" />
                {busy === 'invite' ? 'Generating...' : 'Generate Staff Invite'}
              </Button>
            </div>

            {inviteCode && (
              <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">New invite</p>
                  <code className="mt-1 block text-base font-black text-[#073995]">{inviteCode}</code>
                  <p className="mt-1 text-xs text-slate-500">{ROLE_LABELS[inviteRole]}</p>
                </div>
                <Button variant="outline" onClick={() => void copyInvite()} className="gap-2">
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy Invite Link'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UsersRound className="h-5 w-5" /> Current Staff</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-950">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
              <p><b>Default branch</b> is stamped automatically on new sales, orders and repairs. Staff without a branch cannot create customer transactions until an administrator assigns one.</p>
            </div>
            {staff.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">No internal staff accounts yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-separate border-spacing-y-2 text-left">
                  <thead>
                    <tr className="text-xs uppercase tracking-[0.1em] text-slate-400">
                      <th className="px-3 py-2">Staff member</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2">Default branch</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((member) => {
                      const role = STAFF_ASSIGNABLE_ROLES.includes(member.role as InternalRole) ? member.role as InternalRole : 'front_desk';
                      const isSelf = member.id === currentUserId;
                      const roleBusy = busy === `role:${member.id}`;
                      const locationBusy = busy === `location:${member.id}`;
                      return (
                        <tr key={member.id} className="bg-white shadow-sm">
                          <td className="rounded-l-xl px-3 py-3">
                            <div className="flex items-center gap-3">
                              <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-[#073995]"><UserCog className="h-4 w-4" /></div>
                              <div>
                                <p className="font-semibold text-slate-900">{member.name}</p>
                                {isSelf && <p className="text-xs text-slate-400">You</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-sm text-slate-600">{member.email}</td>
                          <td className="px-3 py-3">
                            <Select
                              value={role}
                              disabled={roleBusy}
                              onChange={(event) => void changeRole(member.id, event.target.value as InternalRole)}
                            >
                              {STAFF_ASSIGNABLE_ROLES.map((option) => (
                                <option key={option} value={option}>{ROLE_LABELS[option]}</option>
                              ))}
                            </Select>
                          </td>
                          <td className="px-3 py-3">
                            <Select
                              aria-label={`Default branch for ${member.name}`}
                              value={member.default_location_id || ''}
                              disabled={locationBusy}
                              onChange={(event) => void changeLocation(member.id, event.target.value)}
                            >
                              <option value="">Not assigned</option>
                              {locations.map((location) => (
                                <option key={location.id} value={location.id}>{location.name} ({location.code})</option>
                              ))}
                            </Select>
                          </td>
                          <td className="rounded-r-xl px-3 py-3">
                            <Badge variant={member.default_location_id ? 'secondary' : 'outline'}>
                              {member.default_location_id ? 'Active' : 'Needs branch'}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
