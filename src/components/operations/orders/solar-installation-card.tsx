'use client';

import { useActionState } from 'react';
import { saveSolarInstallationAction, type SalesActionState } from '@/app/(staff)/modules/operations/sales-actions';
import type { OperationsSolarInstallation } from '@/lib/operations/types';
import { HelpTip } from '@/components/ui/help-tip';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ActionResult } from '@/components/ui/alert';

const initialState:SalesActionState={success:false,message:''};

export function SolarInstallationCard({orderId,orderItemId,installation,users}:{orderId:string;orderItemId:string;installation:OperationsSolarInstallation|null;users:Array<{id:string;name:string|null;email:string|null}>}){
 const [state,action,pending]=useActionState(saveSolarInstallationAction,initialState);
 return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
   <div className="flex items-center gap-2"><h2 className="text-sm font-black text-slate-900">Solar installation</h2><HelpTip text="A Solar sale may need installation after the Order is confirmed. This card keeps scheduling and installer details separate from the normal Order fulfilment status." label="About Solar installation" /></div>
   <form action={action} className="mt-4 space-y-4"><input type="hidden" name="order_id" value={orderId}/><input type="hidden" name="order_item_id" value={orderItemId}/><label className="flex items-center gap-3 text-sm font-bold text-slate-700"><input type="checkbox" name="installation_required" defaultChecked={installation?.installation_required??true} className="h-4 w-4"/> Installation required</label><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Field label="Installation address"><Input name="installation_address" defaultValue={installation?.installation_address||''} /></Field><Field label="Scheduled date/time"><Input name="scheduled_at" type="datetime-local" defaultValue={toLocal(installation?.scheduled_at)} /></Field><Field label="System capacity"><Input name="system_capacity" defaultValue={installation?.system_capacity||''} placeholder="5kVA / 10kW" /></Field><Field label="Installation cost"><Input name="installation_cost" type="number" min="0" defaultValue={installation?.installation_cost||0} /></Field><Field label="Installer"><Select name="installer_user_id" defaultValue={installation?.installer_user_id||''}><option value="">No staff selected</option>{users.map(u=><option key={u.id} value={u.id}>{u.name||u.email||u.id}</option>)}</Select></Field><Field label="Installer name"><Input name="installer_name" defaultValue={installation?.installer_name||''} /></Field><Field label="Status"><Select name="status" defaultValue={installation?.status||'pending'}><option value="not_required">Not required</option><option value="pending">Pending</option><option value="scheduled">Scheduled</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></Select></Field><Field label="Notes"><Input name="notes" defaultValue={installation?.notes||''} /></Field></div><ActionResult state={state} /><Button type="submit" disabled={pending}>{pending?'Saving...':'Save installation'}</Button></form>
 </section>
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>}
function toLocal(value:string|null|undefined){if(!value)return '';const d=new Date(value);const off=d.getTimezoneOffset();return new Date(d.getTime()-off*60000).toISOString().slice(0,16)}
