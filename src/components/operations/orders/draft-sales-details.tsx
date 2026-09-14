'use client';

import { useActionState, useMemo, useState } from 'react';
import { saveDraftSalesDetailsAction, type SalesActionState } from '@/app/(staff)/modules/operations/sales-actions';
import { getRelevantSpecFields, ORDER_ITEM_TYPES, type OrderItemType } from '@/lib/operations/sales-model';
import type { OperationsOrder, OperationsOrderItem } from '@/lib/operations/types';
import { HelpTip } from '@/components/ui/help-tip';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ActionResult } from '@/components/ui/alert';

const initialState:SalesActionState={success:false,message:''};
const labels:Record<string,string>={generation:'Generation',processor_type:'Processor type',processor_speed_ghz:'Processor speed (GHz)',ram:'RAM',storage_size:'Storage size',storage_type:'Storage type',screen_size:'Screen size',touchscreen:'Touchscreen?',colour:'Colour',os_installed:'OS installed',charger_included:'Charger included?',bag_included:'Bag included?',storage_capacity:'Storage capacity',network_type:'Network type',sim_type:'SIM type',accessories_included:'Accessories included',category:'Category',subcategory:'Sub-category',compatible_with:'Compatible with',system_capacity:'System capacity',brand:'Brand',model_spec:'Model / spec'};

export function DraftSalesDetails({order,item,users}:{order:OperationsOrder;item:OperationsOrderItem;users:Array<{id:string;name:string|null;email:string|null}>}){
 const [state,action,pending]=useActionState(saveDraftSalesDetailsAction,initialState);
 const [type,setType]=useState<OrderItemType>(item.item_type||order.order_type||'other');
 const [specs,setSpecs]=useState<Record<string,unknown>>(item.specs||{});
 const fields=useMemo(()=>getRelevantSpecFields(type),[type]);
 return <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-5">
   <div className="flex items-center gap-2"><h2 className="text-sm font-black text-emmy-primary">Sales details</h2><HelpTip text="These fields match the information EmmyTech has been keeping in the Sales Database. Only details for this kind of item are shown, so the Order stays simple." label="About Sales details" /></div>
   <form action={action} className="mt-4 space-y-4"><input type="hidden" name="order_id" value={order.id}/><input type="hidden" name="item_id" value={item.id}/><input type="hidden" name="order_type" value={type}/><input type="hidden" name="item_type" value={type}/><input type="hidden" name="specs_json" value={JSON.stringify(specs)}/>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Field label="Order / item type"><Select value={type} onChange={e=>{setType(e.target.value as OrderItemType);setSpecs({});}}>{ORDER_ITEM_TYPES.map(t=><option key={t} value={t}>{t[0].toUpperCase()+t.slice(1)}</option>)}</Select></Field><Field label="Brand"><Input name="brand" defaultValue={item.brand||''} /></Field><Field label="Model"><Input name="model" defaultValue={item.model||''} /></Field><Field label="Condition"><Input name="condition" defaultValue={item.condition||''} placeholder="Grade A – Excellent" /></Field><Field label="Internal unit cost"><Input name="unit_cost_snapshot" type="number" min="0" defaultValue={item.unit_cost_snapshot??''} /></Field><Field label="Warranty period"><Input name="warranty_period" defaultValue={item.warranty_period||''} placeholder="1 Month" /></Field><Field label="Warranty expiry"><Input name="warranty_expires_at" type="date" defaultValue={item.warranty_expires_at||''} /></Field><Field label="Sales staff"><Select name="sales_staff_user_id" defaultValue={order.sales_staff_user_id||''}><option value="">No staff selected</option>{users.map(u=><option key={u.id} value={u.id}>{u.name||u.email||u.id}</option>)}</Select></Field><Field label="Sales staff name snapshot"><Input name="sales_staff_name" defaultValue={order.sales_staff_name||''} placeholder="Optional display name" /></Field></div>
    {fields.length>0&&<div><p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">{type} specifications</p><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{fields.map(key=><Field key={key} label={labels[key]||key.replaceAll('_',' ')}>{key==='touchscreen'||key==='charger_included'||key==='bag_included'?<Select value={String(specs[key]??'')} onChange={e=>setSpecs(v=>({...v,[key]:e.target.value===''?null:e.target.value==='true'}))}><option value="">Not set</option><option value="true">Yes</option><option value="false">No</option></Select>:<Input value={String(specs[key]??'')} onChange={e=>setSpecs(v=>({...v,[key]:e.target.value}))} />}</Field>)}</div></div>}
    <ActionResult state={state} /><Button type="submit" disabled={pending}>{pending?'Saving...':'Save sales details'}</Button>
   </form>
 </section>
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label><span className="mb-1.5 block text-xs font-bold capitalize text-slate-600">{label}</span>{children}</label>}
