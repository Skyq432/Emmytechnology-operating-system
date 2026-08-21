import { NextResponse } from "next/server";

const stageNames: Record<number, string> = {
  1: "Awareness",
  2: "Interest",
  3: "Consideration",
  4: "Intent",
  5: "Purchase",
  6: "Onboarding",
  7: "Satisfaction",
  8: "Loyalty",
  9: "Expansion",
  10: "Advocacy",
};

type AnyRow = Record<string, any>;
type Tracking = "Automatic" | "Manual" | "Recommended";

type LeadHealth = "healthy" | "at_risk" | "cold" | "customer";

const fallbackStageRules: Record<number, {
  delayMinutes: number;
  expectedProgressMinutes: number;
  coldAfterMinutes: number;
  taskWindowMinutes: number;
  priority: string;
  actionTemplate: string;
}> = {
  1: {
    delayMinutes: 2880,
    expectedProgressMinutes: 4320,
    coldAfterMinutes: 10080,
    taskWindowMinutes: 1440,
    priority: "Low",
    actionTemplate: "Contact the lead once to understand what product they are interested in and whether they want help choosing an option.",
  },
  2: {
    delayMinutes: 1440,
    expectedProgressMinutes: 2880,
    coldAfterMinutes: 7200,
    taskWindowMinutes: 1440,
    priority: "Medium",
    actionTemplate: "Contact the customer about their voucher and ask which product they would like to use it toward.",
  },
  3: {
    delayMinutes: 720,
    expectedProgressMinutes: 2880,
    coldAfterMinutes: 5760,
    taskWindowMinutes: 1440,
    priority: "Medium",
    actionTemplate: "Contact the customer to understand which product option they prefer and answer any buying questions.",
  },
  4: {
    delayMinutes: 60,
    expectedProgressMinutes: 1440,
    coldAfterMinutes: 2880,
    taskWindowMinutes: 720,
    priority: "High",
    actionTemplate: "Contact the customer about the product in their cart and ask if they need help completing the order.",
  },
  5: {
    delayMinutes: 15,
    expectedProgressMinutes: 1440,
    coldAfterMinutes: 4320,
    taskWindowMinutes: 240,
    priority: "High",
    actionTemplate: "Open the WhatsApp handoff, continue the sales conversation, then record the outcome in CRM.",
  },
};

const COLD_AFTER_HUMAN_CONTACT_MINUTES = 4 * 24 * 60;
type ActivityRow = {
  title: string;
  detail: string;
  at: string;
  tracking: Tracking;
  tone: "blue" | "green" | "amber" | "slate";
};

type Context = {
  identity: AnyRow;
  id: string;
  playerRows: AnyRow[];
  player?: AnyRow;
  logRows: AnyRow[];
  prizeRows: AnyRow[];
  leadRows: AnyRow[];
  lead?: AnyRow;
  interestRows: AnyRow[];
  webRows: AnyRow[];
  smsRows: AnyRow[];
  signalRows: AnyRow[];
  crmNoteRows: AnyRow[];
  manualRows: AnyRow[];
  linkedLeadEvents: AnyRow[];
  referralRows: AnyRow[];
  stage: number;
  manualStageRow?: AnyRow;
  product?: AnyRow | null;
  referrerIdentityId: string | null;
  referrerName: string | null;
  generation: number | null;
  originalAmbassadorId: string | null;
  originalAmbassadorName: string | null;
  ownerType: "ambassador" | "admin" | "unassigned";
  ownerId: string | null;
  ownerLabel: string;
  triggerAt: string;
};

function normalize(value?: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function humanize(value?: unknown) {
  const s = String(value ?? "").replace(/[_-]+/g, " ").trim();
  if (!s) return "Activity";
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function money(value: unknown) {
  const numeric = Number(value);
  if (value === null || value === undefined || value === "" || Number.isNaN(numeric)) return "—";
  return `₦${numeric.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function timeAgo(input?: string | null) {
  if (!input) return "—";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "—";
  const ms = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"}`;
  return `${Math.floor(days / 30)} mo`;
}

function dueLabel(input?: string | null) {
  if (!input) return "—";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "—";
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return `due ${timeAgo(input)} ago`;
  const minutes = Math.ceil(diff / 60000);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `in ${hours} hr${hours === 1 ? "" : "s"}`;
  const days = Math.ceil(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

function compactDuration(minutesValue: number) {
  const minutes = Math.max(0, Math.floor(minutesValue));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function stageRule(stage: number, rule?: AnyRow | null) {
  const fallback = fallbackStageRules[stage] ?? {
    delayMinutes: 1440,
    expectedProgressMinutes: 2880,
    coldAfterMinutes: 5760,
    taskWindowMinutes: 1440,
    priority: "Medium",
    actionTemplate: "Review this lead and decide the next appropriate action.",
  };
  return {
    delayMinutes: Number(rule?.delay_minutes ?? fallback.delayMinutes),
    expectedProgressMinutes: Number(rule?.expected_progress_minutes ?? fallback.expectedProgressMinutes),
    coldAfterMinutes: Number(rule?.cold_after_minutes ?? fallback.coldAfterMinutes),
    taskWindowMinutes: Number(rule?.task_window_minutes ?? fallback.taskWindowMinutes),
    priority: rule?.priority || fallback.priority,
    actionTemplate: rule?.action_template || fallback.actionTemplate,
    maxContactAttempts: Number(rule?.max_contact_attempts ?? 3),
    active: rule?.active !== false,
  };
}

function stageFromText(value?: unknown) {
  const s = normalize(value);
  if (!s) return 0;
  if (/(advocacy|qualified.?referral)/.test(s)) return 10;
  if (/(expansion|cross.?sell)/.test(s)) return 9;
  if (/(loyalty|repeat.?buyer|repeat.?purchase)/.test(s)) return 8;
  if (/(satisfaction|feedback|review)/.test(s)) return 7;
  if (/(onboarding|paid|delivery|customer_active)/.test(s)) return 6;
  if (/(purchase|whatsapp|handoff|send.?to.?emmy)/.test(s)) return 5;
  if (/(intent|added.?to.?cart|add.?to.?cart|cart)/.test(s)) return 4;
  if (/(consideration|brows|product.?interest|product.?view|search)/.test(s)) return 3;
  if (/(interest|voucher|claim)/.test(s)) return 2;
  if (/(awareness|spin|new.?lead)/.test(s)) return 1;
  return 0;
}

function websiteStage(eventType?: unknown) {
  const s = normalize(eventType);
  if (!s) return 0;
  if (/(whatsapp|send.?to.?emmy|send.?message|handoff|checkout)/.test(s)) return 5;
  if (/(add.?to.?cart|cart.?add|cart_item_added)/.test(s)) return 4;
  if (/(product|view|search|browse)/.test(s)) return 3;
  return 0;
}

function trackingForStage(stage: number): Tracking {
  if (stage === 9) return "Recommended";
  if (stage >= 5) return "Manual";
  return "Automatic";
}

function blockerFor(stage: number) {
  const blockers: Record<number, string> = {
    1: "Has not claimed a voucher yet",
    2: "Voucher exists but product intent is still weak",
    3: "Product interest exists but there is no cart action yet",
    4: "Product is in cart but has not been handed to sales",
    5: "WhatsApp conversation is not visible automatically",
    6: "Delivery or setup still needs confirmation",
    7: "Post-sale feedback has not been captured",
    8: "No current repeat-purchase action is due",
    9: "Cross-sell opportunity needs a relevant recommendation",
    10: "Advocacy status needs review",
  };
  return blockers[stage] ?? null;
}

function arrayByIdentity(rows: AnyRow[]) {
  const map = new Map<string, AnyRow[]>();
  for (const row of rows) {
    const id = row.identity_id;
    if (!id) continue;
    const list = map.get(id) ?? [];
    list.push(row);
    map.set(id, list);
  }
  return map;
}

function latestByDate(rows: AnyRow[], keys = ["updated_at", "created_at"]) {
  return [...rows].sort((a, b) => {
    const aDate = keys.map((key) => a[key]).find(Boolean);
    const bDate = keys.map((key) => b[key]).find(Boolean);
    return new Date(bDate ?? 0).getTime() - new Date(aDate ?? 0).getTime();
  })[0];
}

function earliestByDate(rows: AnyRow[], keys = ["created_at"]) {
  return [...rows].sort((a, b) => {
    const aDate = keys.map((key) => a[key]).find(Boolean);
    const bDate = keys.map((key) => b[key]).find(Boolean);
    return new Date(aDate ?? 0).getTime() - new Date(bDate ?? 0).getTime();
  })[0];
}

function newestDate(values: Array<string | null | undefined>) {
  return values
    .filter(Boolean)
    .sort((a, b) => new Date(b as string).getTime() - new Date(a as string).getTime())[0] as string | undefined;
}

function addMinutes(input: string, minutes: number) {
  return new Date(new Date(input).getTime() + minutes * 60_000).toISOString();
}

function maxDate(...values: Array<string | null | undefined>) {
  return newestDate(values) ?? new Date().toISOString();
}

function productFrom(rows: AnyRow[], products: Map<string, AnyRow>) {
  const row = latestByDate(rows, ["created_at", "viewed_at"]);
  if (!row?.product_id) return null;
  return products.get(row.product_id) ?? null;
}

function numericFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const data = metadata as Record<string, unknown>;
  for (const key of ["cart_value", "cartValue", "cart_total", "cartTotal", "total_amount", "total", "amount", "subtotal"]) {
    const value = Number(data[key]);
    if (!Number.isNaN(value) && value > 0) return value;
  }
  return null;
}

function dedupeActivities(activities: ActivityRow[]) {
  const seen = new Set<string>();
  return activities
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .filter((activity) => {
      const key = `${activity.title}|${activity.at}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 40)
    .map((activity) => ({ ...activity, time: timeAgo(activity.at) }));
}

function displayIdentity(identity?: AnyRow | null) {
  if (!identity) return null;
  return identity.primary_name || identity.primary_phone || identity.primary_email || identity.identity_code || null;
}

function ambassadorLabel(row?: AnyRow | null, id?: string | null) {
  if (row) {
    return row.full_name || row.name || row.display_name || row.tag || row.email || row.username || `Ambassador ${String(row.id ?? "").slice(0, 8)}`;
  }
  return id ? `Ambassador ${id.slice(0, 8)}` : null;
}

function triggerForStage(stage: number, ctx: Pick<Context, "webRows" | "interestRows" | "lead" | "identity">) {
  if (stage === 3) {
    return maxDate(
      ...ctx.webRows.filter((row) => websiteStage(row.event_type) === 3).map((row) => row.created_at),
      ...ctx.interestRows.map((row) => row.created_at),
      ctx.lead?.updated_at,
      ctx.identity.updated_at,
    );
  }
  if (stage === 4) {
    return maxDate(
      ...ctx.webRows.filter((row) => websiteStage(row.event_type) === 4).map((row) => row.created_at),
      ctx.lead?.updated_at,
      ctx.identity.updated_at,
    );
  }
  if (stage === 5) {
    return maxDate(
      ...ctx.webRows.filter((row) => websiteStage(row.event_type) === 5).map((row) => row.created_at),
      ctx.lead?.last_clicked_at,
      ctx.lead?.updated_at,
      ctx.identity.updated_at,
    );
  }
  return maxDate(ctx.lead?.updated_at, ctx.identity.updated_at, ctx.identity.created_at);
}

export async function GET() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!url || !key) {
    return NextResponse.json({ error: "SUPABASE_URL and SUPABASE_SECRET_KEY are required." }, { status: 500 });
  }
  const configuredUrl = url;
  const configuredKey = key;

  async function requestRows(path: string, init: RequestInit = {}) {
    const endpoint = new URL(`/rest/v1/${path}`, configuredUrl);
    const headers = new Headers(init.headers);
    headers.set("apikey", configuredKey);
    headers.set("Accept", "application/json");
    if (init.body) headers.set("Content-Type", "application/json");
    const response = await fetch(endpoint, { ...init, headers, cache: "no-store" });
    if (!response.ok) throw new Error(await response.text());
    const text = await response.text();
    return text ? JSON.parse(text) : [];
  }

  async function fetchAll(table: string, select: string, order?: string, maxPages = 5) {
    const rows: AnyRow[] = [];
    const pageSize = 1000;
    for (let page = 0; page < maxPages; page += 1) {
      const params = new URLSearchParams({ select });
      if (order) params.set("order", order);
      const endpoint = new URL(`/rest/v1/${table}?${params.toString()}`, configuredUrl);
      const response = await fetch(endpoint, {
        headers: { apikey: configuredKey, Accept: "application/json", Range: `${page * pageSize}-${page * pageSize + pageSize - 1}` },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`${table}: ${await response.text()}`);
      const pageRows = await response.json();
      rows.push(...pageRows);
      if (pageRows.length < pageSize) break;
    }
    return rows;
  }

  async function fetchOptional(table: string, select = "*", order?: string, maxPages = 3) {
    try {
      return await fetchAll(table, select, order, maxPages);
    } catch {
      return [] as AnyRow[];
    }
  }

  async function bulkInsert(table: string, rows: AnyRow[], upsertConflict?: string) {
    if (!rows.length) return [];
    const suffix = upsertConflict ? `?on_conflict=${encodeURIComponent(upsertConflict)}` : "";
    return requestRows(`${table}${suffix}`, {
      method: "POST",
      headers: { Prefer: upsertConflict ? "resolution=merge-duplicates,return=representation" : "return=representation" },
      body: JSON.stringify(rows),
    });
  }

  async function bulkPatch(table: string, ids: string[], body: AnyRow) {
    if (!ids.length) return [];
    const encoded = ids.map((id) => `\"${id}\"`).join(",");
    return requestRows(`${table}?id=in.(${encoded})`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(body),
    });
  }

  async function optionalWrite(operation: () => Promise<unknown>) {
    try {
      return await operation();
    } catch {
      return [];
    }
  }

  try {
    const [
      identities,
      identityEvents,
      identitySignals,
      spinPlayers,
      spinLogs,
      spinPrizes,
      leads,
      leadEvents,
      productInterests,
      websiteEvents,
      products,
      smsRecipients,
      spinReferrals,
      conversions,
      users,
      crmNotes,
      crmManualUpdates,
      crmTasksInitial,
      crmOwnership,
      crmContactStates,
      followupRules,
      ambassadors,
    ] = await Promise.all([
      fetchAll("identities", "id,identity_code,primary_name,primary_phone,primary_email,status,confidence_score,created_at,updated_at", "updated_at.desc", 3),
      fetchAll("identity_events", "id,identity_id,event_type,title,description,metadata,created_at", "created_at.desc", 5),
      fetchAll("identity_signals", "id,identity_id,signal_type,signal_value,confidence_weight,verified,last_seen_at,seen_count,source", "last_seen_at.desc", 5),
      fetchAll("spin_players", "id,identity_id,phone_number,full_name,email,referral_code,spins_remaining,wallet_balance,total_referrals_count,total_cash_won,total_cash_off_won,last_prize_won,last_prize_type,dm_clicked_at,created_at,updated_at", "updated_at.desc", 3),
      fetchAll("spin_logs", "id,identity_id,spin_player_id,result_label,result_type,cash_amount,cash_off_after,spin_number,dm_clicked_at,claim_message,created_at", "created_at.desc", 5),
      fetchAll("spin_user_prizes", "id,identity_id,spin_player_id,prize_label,status,claimed_at,result_type,cash_amount,cash_off_after,created_at", "created_at.desc", 5),
      fetchAll("leads", "id,identity_id,ambassador_id,source,customer_name,customer_phone,customer_email,status,notes,assigned_admin,created_at,updated_at,product_id,lead_type,lead_code,click_count,last_clicked_at,funnel_stage,whatsapp_message,whatsapp_url,approved_as_lead", "updated_at.desc", 5),
      fetchAll("lead_events", "id,lead_id,ambassador_id,event_type,event_title,event_description,event_data,created_at", "created_at.desc", 5),
      fetchAll("product_interests", "id,identity_id,lead_id,product_id,interest_type,source,note,created_at", "created_at.desc", 5),
      fetchAll("website_events", "id,identity_id,lead_id,product_id,event_type,quantity,source_page,page_url,search_query,results_count,metadata,created_at", "created_at.desc", 5),
      fetchAll("products", "id,name,price,sale_price,category,status,created_at,updated_at", "updated_at.desc", 3),
      fetchAll("sms_campaign_recipient_details", "id,lead_id,first_name,full_name,phone_normalized,whatsapp_outreach_status,clicked_at,whatsapp_claimed_at,created_at", "created_at.desc", 5),
      fetchAll("spin_referrals", "id,referrer_identity_id,referred_identity_id,status,reward_granted,reward_spin_amount,created_at", "created_at.desc", 5),
      fetchAll("conversions", "id,lead_id,ambassador_id,amount,approved_at,conversion_sequence,is_repeat_conversion,is_commissionable,internal_note", "approved_at.desc", 5),
      fetchAll("users", "id,name,email,role,created_at", "created_at.desc", 2),
      fetchOptional("crm_notes", "id,identity_id,body,author,created_at", "created_at.desc", 5),
      fetchOptional("crm_manual_updates", "id,identity_id,update_type,value,note,updated_by,created_at", "created_at.desc", 5),
      fetchOptional("crm_tasks", "*", "due_at.asc", 5),
      fetchOptional("crm_lead_ownership", "*", "updated_at.desc", 5),
      fetchOptional("crm_contact_state", "*", "updated_at.desc", 5),
      fetchOptional("crm_followup_rules", "*", "stage.asc", 2),
      fetchOptional("ambassadors", "*", "created_at.desc", 3),
    ]);

    const identityMap = new Map(identities.map((row) => [row.id, row]));
    const productMap = new Map(products.map((row) => [row.id, row]));
    const userMap = new Map(users.map((row) => [row.id, row]));
    const ambassadorMap = new Map(ambassadors.map((row) => [row.id, row]));
    const eventsByIdentity = arrayByIdentity(identityEvents);
    const signalsByIdentity = arrayByIdentity(identitySignals);
    const playersByIdentity = arrayByIdentity(spinPlayers);
    const logsByIdentity = arrayByIdentity(spinLogs);
    const prizesByIdentity = arrayByIdentity(spinPrizes);
    const leadsByIdentity = arrayByIdentity(leads);
    const interestsByIdentity = arrayByIdentity(productInterests);
    const webByIdentity = arrayByIdentity(websiteEvents);
    const leadIdentityById = new Map(
      leads
        .filter((row) => row.id && row.identity_id)
        .map((row) => [String(row.id), String(row.identity_id)])
    );

    const conversionRowsWithIdentity: AnyRow[] = (conversions as AnyRow[])
      .map((row: AnyRow): AnyRow => ({
        ...row,
        identity_id: row.lead_id
          ? leadIdentityById.get(String(row.lead_id)) ?? null
          : null,
      }))
      .filter((row: AnyRow) => Boolean(row.identity_id));

    const conversionsByIdentity = arrayByIdentity(conversionRowsWithIdentity);

    const approvedConvertedIdentityIds = new Set(
      conversionRowsWithIdentity
        .filter((row) => Boolean(row.approved_at))
        .map((row) => String(row.identity_id))
    );

    const smsByIdentity = arrayByIdentity(
      smsRecipients.map((row) => ({
        ...row,
        identity_id:
          row.identity_id ||
          (row.lead_id ? leadIdentityById.get(String(row.lead_id)) : null),
      }))
    );
    const crmNotesByIdentity = arrayByIdentity(crmNotes);
    const manualUpdatesByIdentity = arrayByIdentity(crmManualUpdates);
    const tasksByIdentityInitial = arrayByIdentity(crmTasksInitial);
    const contactStateByIdentity = new Map(crmContactStates.map((row) => [row.identity_id, row]));
    const ownershipByIdentity = new Map(crmOwnership.map((row) => [row.identity_id, row]));
    const ruleByStage = new Map(followupRules.map((row) => [Number(row.stage), row]));

    const leadEventsByLead = new Map<string, AnyRow[]>();
    for (const row of leadEvents) {
      if (!row.lead_id) continue;
      const list = leadEventsByLead.get(row.lead_id) ?? [];
      list.push(row);
      leadEventsByLead.set(row.lead_id, list);
    }

    const directReferralByChild = new Map<string, AnyRow>();
    const referralsByIdentity = new Map<string, AnyRow[]>();
    for (const row of [...spinReferrals].sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime())) {
      if (row.referred_identity_id && !directReferralByChild.has(row.referred_identity_id)) {
        directReferralByChild.set(row.referred_identity_id, row);
      }
      for (const id of [row.referrer_identity_id, row.referred_identity_id]) {
        if (!id) continue;
        const list = referralsByIdentity.get(id) ?? [];
        list.push(row);
        referralsByIdentity.set(id, list);
      }
    }

    const lineageMemo = new Map<string, { generation: number | null; originalAmbassadorId: string | null }>();
    function lineage(identityId: string, trail = new Set<string>()): { generation: number | null; originalAmbassadorId: string | null } {
      if (lineageMemo.has(identityId)) return lineageMemo.get(identityId)!;
      if (trail.has(identityId)) return { generation: null, originalAmbassadorId: null };
      const nextTrail = new Set(trail);
      nextTrail.add(identityId);

      const leadRows = leadsByIdentity.get(identityId) ?? [];
      const directAmbassadorLead = latestByDate(leadRows.filter((row) => row.ambassador_id));
      if (directAmbassadorLead?.ambassador_id) {
        const value = { generation: 1, originalAmbassadorId: String(directAmbassadorLead.ambassador_id) };
        lineageMemo.set(identityId, value);
        return value;
      }

      const referral = directReferralByChild.get(identityId);
      if (referral?.referrer_identity_id) {
        const parent = lineage(String(referral.referrer_identity_id), nextTrail);
        const value = {
          generation: parent.generation ? parent.generation + 1 : null,
          originalAmbassadorId: parent.originalAmbassadorId,
        };
        lineageMemo.set(identityId, value);
        return value;
      }

      const value = { generation: null, originalAmbassadorId: null };
      lineageMemo.set(identityId, value);
      return value;
    }

    const contexts: Context[] = [];
    for (const identity of identities) {
      const id = identity.id;
      const playerRows = playersByIdentity.get(id) ?? [];
      const player = latestByDate(playerRows);
      const logRows = logsByIdentity.get(id) ?? [];
      const prizeRows = prizesByIdentity.get(id) ?? [];
      const leadRows = leadsByIdentity.get(id) ?? [];
      const lead = latestByDate(leadRows);
      const interestRows = interestsByIdentity.get(id) ?? [];
      const webRows = webByIdentity.get(id) ?? [];
      const smsRows = smsByIdentity.get(id) ?? [];
      const signalRows = signalsByIdentity.get(id) ?? [];
      const crmNoteRows = crmNotesByIdentity.get(id) ?? [];
      const manualRows = manualUpdatesByIdentity.get(id) ?? [];
      const linkedLeadEvents = leadRows.flatMap((row) => leadEventsByLead.get(row.id) ?? []);
      const referralRows = referralsByIdentity.get(id) ?? [];
      const conversionRows = conversionsByIdentity.get(id) ?? [];
      const approvedConversions = conversionRows.filter((row) => Boolean(row.approved_at));

      const hasApprovedConversion = approvedConversions.length > 0;
      const hasRepeatConversion =
        approvedConversions.some(
          (row) =>
            row.is_repeat_conversion === true ||
            Number(row.conversion_sequence ?? 0) >= 2
        ) ||
        approvedConversions.length >= 2;

      // Advocacy is customer advocacy, not simply being referred by an ambassador.
      // A person qualifies automatically only when:
      // 1. they are already a confirmed customer, and
      // 2. someone they referred also has an approved conversion.
      const hasConvertedReferral = referralRows.some(
        (row) =>
          String(row.referrer_identity_id ?? "") === String(id) &&
          Boolean(row.referred_identity_id) &&
          approvedConvertedIdentityIds.has(String(row.referred_identity_id))
      );

      const conversionStage = hasRepeatConversion ? 8 : hasApprovedConversion ? 6 : 0;
      const advocacyStage = hasApprovedConversion && hasConvertedReferral ? 10 : 0;

      // Text-derived data can establish stages 1-9, but Stage 10 requires
      // explicit manual placement or verified customer + converted referral evidence.
      const leadStage = Math.min(
        9,
        Math.max(0, ...leadRows.map((row) => stageFromText(row.funnel_stage)))
      );
      const eventStage = Math.max(0, ...webRows.map((row) => websiteStage(row.event_type)));
      const prizeStage = prizeRows.some(
        (row) => row.claimed_at || normalize(row.status).includes("claim")
      ) ? 2 : 0;
      const spinStage = playerRows.length || logRows.length ? 1 : 0;
      const identityEventStage = Math.min(
        9,
        Math.max(
          0,
          ...(eventsByIdentity.get(id) ?? []).map((row) =>
            stageFromText(`${row.event_type} ${row.title}`)
          )
        )
      );

      const computedStage = Math.max(
        1,
        leadStage,
        eventStage,
        prizeStage,
        spinStage,
        identityEventStage,
        conversionStage,
        advocacyStage
      );

      const manualStageRow = latestByDate(
        manualRows.filter((row) => normalize(row.update_type) === "funnel_stage")
      );
      const manualStage = Number(manualStageRow?.value);

      // Manual correction may override behavioural stages, but confirmed
      // purchase evidence must never be downgraded back into a prospect stage.
      const stage =
        Number.isInteger(manualStage) && manualStage >= 1 && manualStage <= 10
          ? Math.max(manualStage, conversionStage, advocacyStage)
          : computedStage;

      const product =
        productFrom(interestRows, productMap) ??
        productFrom(webRows.filter((row) => row.product_id), productMap) ??
        (lead?.product_id ? productMap.get(lead.product_id) : null);

      const directReferral = directReferralByChild.get(id);
      const line = lineage(id);
      const ambassadorRow = line.originalAmbassadorId ? ambassadorMap.get(line.originalAmbassadorId) : null;
      let referrerIdentityId = directReferral?.referrer_identity_id ? String(directReferral.referrer_identity_id) : null;
      if (!referrerIdentityId && line.generation === 1 && ambassadorRow?.identity_id) {
        referrerIdentityId = String(ambassadorRow.identity_id);
      }
      const referrerName =
        displayIdentity(referrerIdentityId ? identityMap.get(referrerIdentityId) : null) ||
        (line.generation === 1 ? ambassadorLabel(ambassadorRow, line.originalAmbassadorId) : null);
      const originalAmbassadorName = ambassadorLabel(ambassadorRow, line.originalAmbassadorId);

      const ownership = ownershipByIdentity.get(id);
      let ownerType: "ambassador" | "admin" | "unassigned" = "unassigned";
      let ownerId: string | null = null;
      let ownerLabel = "EmmyTech Assignment Queue";

      if (ownership?.owner_type) {
        ownerType = ownership.owner_type;
        ownerId = ownership.owner_id || null;
        ownerLabel = ownership.owner_label || (ownerType === "unassigned" ? "EmmyTech Assignment Queue" : "Assigned owner");
      } else if (line.generation === 1 && line.originalAmbassadorId) {
        ownerType = "ambassador";
        ownerId = line.originalAmbassadorId;
        ownerLabel = originalAmbassadorName || `Ambassador ${line.originalAmbassadorId.slice(0, 8)}`;
      } else if (lead?.assigned_admin) {
        ownerType = "admin";
        ownerId = String(lead.assigned_admin);
        const assigned = userMap.get(lead.assigned_admin);
        ownerLabel = assigned?.name || assigned?.email || "Assigned admin";
      }

      const partial: Context = {
        identity, id, playerRows, player, logRows, prizeRows, leadRows, lead, interestRows, webRows, smsRows, signalRows,
        crmNoteRows, manualRows, linkedLeadEvents, referralRows, stage, manualStageRow, product,
        referrerIdentityId, referrerName, generation: line.generation, originalAmbassadorId: line.originalAmbassadorId,
        originalAmbassadorName, ownerType, ownerId, ownerLabel, triggerAt: "",
      };
      partial.triggerAt = triggerForStage(stage, partial);
      contexts.push(partial);
    }

    const ownershipUpserts: AnyRow[] = [];
    for (const ctx of contexts) {
      const existing = ownershipByIdentity.get(ctx.id);
      if (!existing) {
        ownershipUpserts.push({
          identity_id: ctx.id,
          referrer_identity_id: ctx.referrerIdentityId,
          original_ambassador_id: ctx.originalAmbassadorId,
          generation: ctx.generation,
          owner_type: ctx.ownerType,
          owner_id: ctx.ownerId,
          owner_label: ctx.ownerLabel,
          assigned_by: "system",
          assigned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }
    if (ownershipUpserts.length) {
      await optionalWrite(() => bulkInsert("crm_lead_ownership", ownershipUpserts, "identity_id"));
    }

    const taskInserts: AnyRow[] = [];
    const taskCancelIds: string[] = [];
    const taskExpireIds: string[] = [];
    const contactStateUpserts: AnyRow[] = [];
    const nowMs = Date.now();

    for (const ctx of contexts) {
      const existingTasks = tasksByIdentityInitial.get(ctx.id) ?? [];
      const openAuto = existingTasks.filter((row) => normalize(row.status) === "open" && row.auto_generated);
      for (const task of openAuto) {
        const expired = task.expires_at && new Date(task.expires_at).getTime() <= nowMs;
        if (expired) {
          taskExpireIds.push(task.id);
          continue;
        }
        if (Number(task.source_stage) !== ctx.stage) taskCancelIds.push(task.id);
      }

      const rawRule = ruleByStage.get(ctx.stage);
      const rule = stageRule(ctx.stage, rawRule);
      if (!rule.active || ![1, 2, 3, 4, 5].includes(ctx.stage)) continue;

      let contactState = contactStateByIdentity.get(ctx.id);
      const stateUpdatedAt = contactState?.updated_at ? new Date(contactState.updated_at).getTime() : 0;
      const newBehaviorAfterCooling = contactState?.dormant && new Date(ctx.triggerAt).getTime() > stateUpdatedAt;
      if (newBehaviorAfterCooling) {
        contactState = {
          ...contactState,
          dormant: false,
          contact_attempt_count: 0,
          next_contact_allowed_at: null,
          cooling_until: null,
          updated_at: new Date().toISOString(),
        };
        contactStateByIdentity.set(ctx.id, contactState);
        contactStateUpserts.push(contactState);
      }

      const attempts = Number(contactState?.contact_attempt_count ?? 0);
      if (contactState?.dormant || attempts >= rule.maxContactAttempts) continue;

      const stillOpen = openAuto.find((row) => Number(row.source_stage) === ctx.stage && !taskCancelIds.includes(row.id) && !taskExpireIds.includes(row.id));
      if (stillOpen) continue;

      const dueFromBehavior = addMinutes(ctx.triggerAt, rule.delayMinutes);
      const dueAt = maxDate(dueFromBehavior, contactState?.next_contact_allowed_at);
      const expiresAt = addMinutes(dueAt, rule.taskWindowMinutes);
      const dedupeKey = `${ctx.id}:${ctx.stage}:${ctx.triggerAt}:${attempts}`;
      if (existingTasks.some((row) => row.dedupe_key === dedupeKey)) continue;

      const productName = ctx.product?.name || "the product";
      const actionText = ctx.stage === 1
        ? "Contact the lead once to understand what product they are interested in and whether they want help choosing an option."
        : ctx.stage === 2
          ? "Contact the customer about their voucher and ask which product they would like to use it toward."
          : ctx.stage === 4
            ? `Contact the customer about ${productName} in their cart and ask if they need help completing the order.`
            : ctx.stage === 5
              ? "Open the WhatsApp handoff, continue the sales conversation, then record the outcome in CRM."
              : `Contact the customer to understand which ${productName} option they prefer and answer any buying questions.`;
      const title = ctx.stage === 1
        ? "Identify product need"
        : ctx.stage === 2
          ? "Activate voucher interest"
          : ctx.stage === 4
            ? "Follow up on cart"
            : ctx.stage === 5
              ? "Handle WhatsApp handoff"
              : "Clarify product interest";

      taskInserts.push({
        identity_id: ctx.id,
        title,
        description: actionText,
        action_text: actionText,
        priority: rule.priority,
        owner: ctx.ownerLabel,
        due_at: dueAt,
        expires_at: expiresAt,
        status: "open",
        task_type: "follow_up",
        action_key: ctx.stage === 1 ? "awareness_follow_up" : ctx.stage === 2 ? "voucher_follow_up" : ctx.stage === 4 ? "cart_follow_up" : ctx.stage === 5 ? "whatsapp_follow_up" : "consideration_follow_up",
        source_stage: ctx.stage,
        trigger_at: ctx.triggerAt,
        auto_generated: true,
        dedupe_key: dedupeKey,
        owner_type: ctx.ownerType,
        owner_id: ctx.ownerId,
        created_by: "system",
      });
    }

    if (taskCancelIds.length) {
      await optionalWrite(() => bulkPatch("crm_tasks", taskCancelIds, {
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: "Customer progressed to another funnel stage",
        updated_at: new Date().toISOString(),
      }));
    }
    if (taskExpireIds.length) {
      await optionalWrite(() => bulkPatch("crm_tasks", taskExpireIds, {
        status: "expired",
        expired_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
    }
    if (contactStateUpserts.length) {
      await optionalWrite(() => bulkInsert("crm_contact_state", contactStateUpserts, "identity_id"));
    }
    if (taskInserts.length) {
      await optionalWrite(() => bulkInsert("crm_tasks", taskInserts, "dedupe_key"));
    }

    const crmTasks = await fetchOptional("crm_tasks", "*", "due_at.asc", 5);
    const tasksByIdentity = arrayByIdentity(crmTasks);

    const result: AnyRow[] = [];
    for (const ctx of contexts) {
      const { identity, id, playerRows, player, logRows, prizeRows, leadRows, lead, interestRows, webRows, smsRows, signalRows, crmNoteRows, manualRows, linkedLeadEvents, referralRows, stage, manualStageRow, product } = ctx;
      const activities: ActivityRow[] = [];

      for (const row of eventsByIdentity.get(id) ?? []) {
        activities.push({
          title: row.title || humanize(row.event_type), detail: row.description || humanize(row.event_type), at: row.created_at,
          tracking: stageFromText(`${row.event_type} ${row.title}`) >= 6 ? "Manual" : "Automatic", tone: "blue",
        });
      }
      for (const row of webRows) {
        const type = normalize(row.event_type);
        let title = humanize(row.event_type);
        let detail = row.page_url || row.source_page || "Website activity";
        let tone: ActivityRow["tone"] = "blue";
        if (/(whatsapp|send.?to.?emmy|handoff)/.test(type)) {
          title = "Clicked Send to EmmyTech";
          detail = "The CRM sees the handoff click. The conversation after this point requires a staff update.";
          tone = "amber";
        } else if (/(add.?to.?cart|cart.?add|cart_item_added)/.test(type)) {
          title = "Product added to cart";
          detail = productMap.get(row.product_id)?.name || "Cart intent recorded";
          tone = "green";
        } else if (/search/.test(type)) {
          title = "Product search";
          detail = row.search_query ? `Searched for “${row.search_query}”` : "Website search recorded";
        } else if (/(product|view|browse)/.test(type)) {
          title = "Product viewed";
          detail = productMap.get(row.product_id)?.name || row.page_url || "Product interest recorded";
        }
        activities.push({ title, detail, at: row.created_at, tracking: "Automatic", tone });
      }
      for (const row of logRows.slice(0, 20)) {
        activities.push({ title: row.spin_number ? `Spin #${row.spin_number}` : "Spin completed", detail: row.result_label || row.result_type || "Spin Wheel activity", at: row.created_at, tracking: "Automatic", tone: "blue" });
      }
      for (const row of prizeRows.slice(0, 10)) {
        activities.push({ title: row.claimed_at ? "Voucher / prize claimed" : "Prize recorded", detail: row.prize_label || row.result_type || "Spin reward", at: row.claimed_at || row.created_at, tracking: "Automatic", tone: row.claimed_at ? "green" : "blue" });
      }
      for (const row of (conversionsByIdentity.get(id) ?? [])
        .filter((conversion) => Boolean(conversion.approved_at))
        .slice(0, 10)) {
        const repeat =
          row.is_repeat_conversion === true ||
          Number(row.conversion_sequence ?? 0) >= 2;

        activities.push({
          title: repeat ? "Repeat purchase approved" : "Purchase approved",
          detail: `${money(row.amount)} confirmed conversion`,
          at: row.approved_at,
          tracking: "Manual",
          tone: "green",
        });
      }

      for (const row of linkedLeadEvents.slice(0, 20)) {
        activities.push({ title: row.event_title || humanize(row.event_type), detail: row.event_description || humanize(row.event_type), at: row.created_at, tracking: "Manual", tone: "slate" });
      }
      for (const row of manualRows.slice(0, 25)) {
        const type = normalize(row.update_type);
        if (type === "funnel_stage") {
          const movedStage = Number(row.value);
          activities.push({ title: `Stage moved to ${stageNames[movedStage] ?? `Stage ${movedStage}`}`, detail: row.note || `Manual stage update by ${row.updated_by || "staff"}`, at: row.created_at, tracking: "Manual", tone: "slate" });
        } else if (type === "whatsapp_status") {
          activities.push({ title: `WhatsApp outcome: ${row.value}`, detail: row.note || `Recorded by ${row.updated_by || "staff"}`, at: row.created_at, tracking: "Manual", tone: row.value === "Paid" ? "green" : row.value === "Lost" ? "amber" : "slate" });
        } else if (type === "contact_outcome") {
          activities.push({ title: `Follow-up: ${row.value}`, detail: row.note || `Recorded by ${row.updated_by || "staff"}`, at: row.created_at, tracking: "Manual", tone: row.value === "No response" ? "amber" : "slate" });
        }
      }
      for (const row of smsRows.slice(0, 5)) {
        if (row.whatsapp_claimed_at) activities.push({ title: "WhatsApp claim from SMS", detail: row.whatsapp_outreach_status || "Customer responded through SMS campaign handoff", at: row.whatsapp_claimed_at, tracking: "Automatic", tone: "green" });
        else if (row.clicked_at) activities.push({ title: "SMS campaign link clicked", detail: row.whatsapp_outreach_status || "Tracked campaign click", at: row.clicked_at, tracking: "Automatic", tone: "blue" });
      }

      const normalizedActivities = dedupeActivities(activities);
      const allDates = [identity.updated_at, identity.created_at, ...logRows.map((r) => r.created_at), ...webRows.map((r) => r.created_at), ...leadRows.flatMap((r) => [r.updated_at, r.created_at]), ...prizeRows.flatMap((r) => [r.claimed_at, r.created_at])].filter(Boolean);
      const lastActivityAt = newestDate(allDates as string[]);
      const locationSignal = signalRows.find((row) => ["location", "city", "state"].includes(normalize(row.signal_type)));

      const cashOffValues = [player?.total_cash_off_won, ...prizeRows.map((row) => row.cash_off_after), ...smsRows.map((row) => row.cash_off_balance)].map(Number).filter((value) => !Number.isNaN(value));
      const voucherValue = cashOffValues.length ? Math.max(...cashOffValues) : null;
      const cartValues = webRows.map((row) => numericFromMetadata(row.metadata)).filter((value): value is number => value !== null);
      const cartValue = cartValues.length ? Math.max(...cartValues) : null;

      const identitySources: AnyRow[] = [{ label: "Identity Core", detail: `${identity.identity_code || id.slice(0, 8)} · confidence ${identity.confidence_score ?? "—"}`, tone: "blue" }];
      if (ctx.referrerIdentityId) identitySources.push({ label: "Referred by", detail: `${ctx.referrerName || ctx.referrerIdentityId.slice(0, 8)} · Generation ${ctx.generation ?? "—"}`, tone: "green" });
      if (player) identitySources.push({ label: "Spin Wheel", detail: `${player.id.slice(0, 8)} · ${logRows.length} spins · ${player.total_referrals_count ?? 0} referrals`, tone: "green" });
      if (lead) identitySources.push({ label: "Lead", detail: `${lead.lead_code || lead.id.slice(0, 8)} · ${lead.status || "active"}`, tone: "blue" });
      if (webRows.length) identitySources.push({ label: "Website", detail: `${webRows.length} tracked event${webRows.length === 1 ? "" : "s"}`, tone: "slate" });
      if (smsRows.length) identitySources.push({ label: "SMS", detail: `${smsRows.length} campaign record${smsRows.length === 1 ? "" : "s"}`, tone: "slate" });
      if (ctx.originalAmbassadorId) identitySources.push({ label: "Original ambassador", detail: ctx.originalAmbassadorName || ctx.originalAmbassadorId.slice(0, 8), tone: "amber" });
      if (referralRows.length) identitySources.push({ label: "Referral network", detail: `${referralRows.length} linked referral record${referralRows.length === 1 ? "" : "s"}`, tone: "green" });

      const assigned = lead?.assigned_admin ? userMap.get(lead.assigned_admin) : null;
      const notes = [
        ...crmNoteRows.slice(0, 20).map((row) => ({ id: row.id, body: row.body, author: row.author || "Administrator", time: timeAgo(row.created_at) })),
        ...leadRows.filter((row) => row.notes).slice(0, 8).map((row) => ({ id: `lead-${row.id}`, body: row.notes, author: assigned?.name || "Lead record", time: timeAgo(row.updated_at || row.created_at) })),
      ];

      const allTaskRows = tasksByIdentity.get(id) ?? [];
      const openCoverageRows = allTaskRows.filter((row) => {
        if (normalize(row.status) !== "open") return false;
        const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : Number.MAX_SAFE_INTEGER;
        return expiresAt > nowMs;
      });
      const dueTaskRow = openCoverageRows.find((row) => {
        const dueAt = row.due_at ? new Date(row.due_at).getTime() : 0;
        return dueAt <= nowMs;
      });
      const futureTaskRow = openCoverageRows.find((row) => {
        const dueAt = row.due_at ? new Date(row.due_at).getTime() : 0;
        return dueAt > nowMs;
      });
      const stageRuleConfig = stageRule(stage, ruleByStage.get(stage));
      const stageEnteredAt = manualStageRow?.created_at || ctx.triggerAt || identity.created_at || new Date().toISOString();
      const stageAgeMinutes = Math.max(0, Math.floor((nowMs - new Date(stageEnteredAt).getTime()) / 60000));

      const humanContactRows = manualRows.filter((row) => ["contact_outcome", "whatsapp_status"].includes(normalize(row.update_type)));
      const humanLeadEvents = linkedLeadEvents.filter((row) => /(contact|call|whatsapp|message|follow.?up|reached)/i.test(`${row.event_type ?? ""} ${row.event_title ?? ""}`));
      const handledTaskRows = allTaskRows.filter((row) => {
        const status = normalize(row.status);
        return Boolean(row.outcome) || ["contacted", "no_response", "completed", "done"].includes(status);
      });
      const lastHumanContactAt = newestDate([
        ...humanContactRows.map((row) => row.created_at),
        ...humanLeadEvents.map((row) => row.created_at),
        ...handledTaskRows.map((row) => row.completed_at || row.updated_at || row.created_at),
      ]);
      const minutesSinceHumanContact = lastHumanContactAt
        ? Math.max(0, Math.floor((nowMs - new Date(lastHumanContactAt).getTime()) / 60000))
        : null;

      const hasCoverage = openCoverageRows.length > 0;
      const progressWindowPassed = stage < 6 && stageAgeMinutes >= stageRuleConfig.expectedProgressMinutes;
      const coldByStage = stage < 6 && !hasCoverage && stageAgeMinutes >= stageRuleConfig.coldAfterMinutes;
      const coldByStaleHumanContact = stage < 6 && !hasCoverage && minutesSinceHumanContact !== null && minutesSinceHumanContact >= COLD_AFTER_HUMAN_CONTACT_MINUTES;
      const coldLead = coldByStage || coldByStaleHumanContact;
      const atRisk = stage < 6 && !coldLead && progressWindowPassed;
      const healthState: LeadHealth = stage >= 6 ? "customer" : coldLead ? "cold" : atRisk ? "at_risk" : "healthy";
      const coldReason = coldByStaleHumanContact
        ? `Last human contact was ${compactDuration(minutesSinceHumanContact ?? 0)} ago and no follow-up is scheduled`
        : coldByStage
          ? `Stalled in ${stageNames[stage] ?? `Stage ${stage}`} for ${compactDuration(stageAgeMinutes)} with no follow-up coverage`
          : null;

      const followupState = stage >= 6
        ? "customer"
        : dueTaskRow
          ? "due"
          : futureTaskRow
            ? "scheduled"
            : coldLead
              ? "cold"
              : atRisk
                ? "at_risk"
                : "healthy";

      const visibleTaskRows = allTaskRows.filter((row) => {
        const status = normalize(row.status);
        if (status === "cancelled") return false;
        if (status !== "open") return true;
        const dueAt = row.due_at ? new Date(row.due_at).getTime() : 0;
        const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : Number.MAX_SAFE_INTEGER;
        return dueAt <= nowMs && expiresAt > nowMs;
      });
      const tasks = visibleTaskRows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.action_text || row.description || row.title,
        priority: row.priority || "Medium",
        owner: row.owner || ctx.ownerLabel,
        due: dueLabel(row.due_at),
        dueAt: row.due_at,
        expires: row.expires_at ? `expires ${dueLabel(row.expires_at).replace(/^in /, "in ").replace(/^due /, "")}` : null,
        expiresAt: row.expires_at || null,
        status: row.status,
        outcome: row.outcome || null,
        sourceStage: row.source_stage || null,
        autoGenerated: Boolean(row.auto_generated),
      }));
      const activeTask = tasks.find((task) => normalize(task.status) === "open");
      const contactState = contactStateByIdentity.get(id);
      const cooling = contactState?.dormant
        ? `Cooling · no new outreach until ${dueLabel(contactState.next_contact_allowed_at).replace(/^in /, "")}`
        : contactState?.next_contact_allowed_at && new Date(contactState.next_contact_allowed_at).getTime() > Date.now()
          ? `Contact cooldown · next outreach ${dueLabel(contactState.next_contact_allowed_at)}`
          : "Contact allowed";

      const whatsappOverride = latestByDate(manualRows.filter((row) => normalize(row.update_type) === "whatsapp_status"));
      const whatsappStatus = stage >= 5 ? whatsappOverride?.value || lead?.status || smsRows.find((row) => row.whatsapp_outreach_status)?.whatsapp_outreach_status || "Awaiting staff update" : null;
      const source = ctx.referrerIdentityId ? `Referral · ${ctx.referrerName || ctx.referrerIdentityId.slice(0, 8)}` : lead?.source || (player ? "Spin Wheel" : webRows.length ? "Website" : smsRows.length ? "SMS" : "Identity");

      result.push({
        id,
        identityCode: identity.identity_code || id.slice(0, 8).toUpperCase(),
        mergeConfidence: `Identity confidence ${identity.confidence_score ?? "—"}%`,
        name: identity.primary_name || player?.full_name || lead?.customer_name || smsRows[0]?.full_name || "Unknown identity",
        phone: identity.primary_phone || player?.phone_number || lead?.customer_phone || smsRows[0]?.phone_normalized || "—",
        email: identity.primary_email || player?.email || lead?.customer_email || "—",
        location: locationSignal?.signal_value || "—",
        source,
        product: product?.name || player?.last_prize_won || "No product identified yet",
        stage,
        stageName: stageNames[stage] ?? `Stage ${stage}`,
        lastAction: normalizedActivities[0]?.title || lead?.status || "Identity exists in backend",
        nextAction: activeTask?.description || (coldLead ? `Recovery needed — ${coldReason}` : contactState?.dormant ? "No outreach now — lead is cooling" : followupState === "scheduled" ? "No action due yet — follow-up is scheduled" : atRisk ? `At risk — expected to progress within ${compactDuration(stageRuleConfig.expectedProgressMinutes)}` : stage < 6 ? `Healthy — still within the ${compactDuration(stageRuleConfig.expectedProgressMinutes)} progression window` : "No task due now"),
        nextTaskDue: activeTask?.due || null,
        followupState,
        healthState,
        atRisk,
        coldLead,
        coldReason,
        stageAge: compactDuration(stageAgeMinutes),
        stageAgeMinutes,
        expectedProgress: compactDuration(stageRuleConfig.expectedProgressMinutes),
        coldAfter: compactDuration(stageRuleConfig.coldAfterMinutes),
        lastHumanContact: lastHumanContactAt ? timeAgo(lastHumanContactAt) : null,
        owner: ctx.ownerLabel,
        ownerType: ctx.ownerType,
        ownerId: ctx.ownerId,
        priority: activeTask?.priority || (stage === 4 || stage === 5 ? "High" : stage === 3 || stage === 9 ? "Medium" : "Normal"),
        tracking: manualStageRow ? "Manual" : trackingForStage(stage),
        voucher: money(voucherValue),
        cartValue: money(cartValue),
        age: timeAgo(lastActivityAt),
        firstSeen: timeAgo(identity.created_at),
        blocker: blockerFor(stage),
        whatsappStatus,
        whatsappUrl: lead?.whatsapp_url || null,
        whatsappMessage: lead?.whatsapp_message || null,
        referrerIdentityId: ctx.referrerIdentityId,
        referrerName: ctx.referrerName,
        generation: ctx.generation,
        originalAmbassadorId: ctx.originalAmbassadorId,
        originalAmbassadorName: ctx.originalAmbassadorName,
        contactAttempts: Number(contactState?.contact_attempt_count ?? 0),
        coolingStatus: cooling,
        identitySources,
        activities: normalizedActivities,
        tasks,
        notes,
      });
    }

    result.sort((a, b) => {
      const priority = { High: 3, Medium: 2, Normal: 1 } as const;
      const p = priority[b.priority as keyof typeof priority] - priority[a.priority as keyof typeof priority];
      if (p !== 0) return p;
      return String(a.name).localeCompare(String(b.name));
    });

    return NextResponse.json({
      leads: result,
      meta: {
        source: "emmytech-cash-off-spin-wheel",
        identities: identities.length,
        referrals: spinReferrals.length,
        openTasks: crmTasks.filter((row) => {
          if (normalize(row.status) !== "open") return false;
          const dueAt = row.due_at ? new Date(row.due_at).getTime() : 0;
          const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : Number.MAX_SAFE_INTEGER;
          return dueAt <= Date.now() && expiresAt > Date.now();
        }).length,
        generatedTasks: taskInserts.length,
        ownershipRecords: crmOwnership.length + ownershipUpserts.length,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Unable to build CRM identities from the EmmyTech backend", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
