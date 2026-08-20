import { NextResponse } from "next/server";

const stageSlugs: Record<number, string> = {
  1: "awareness",
  2: "interest",
  3: "consideration",
  4: "intent",
  5: "purchase",
  6: "onboarding",
  7: "satisfaction",
  8: "loyalty",
  9: "expansion",
  10: "advocacy",
};

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

type Json = Record<string, unknown>;

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required");
  return { url, key };
}

async function supabase(path: string, init: RequestInit = {}) {
  const { url, key } = config();
  const endpoint = new URL(`/rest/v1/${path}`, url);
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(endpoint, { ...init, headers, cache: "no-store" });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function latestLead(identityId: string) {
  const rows = await supabase(
    `leads?select=id,funnel_stage,status,updated_at&identity_id=eq.${encodeURIComponent(identityId)}&order=updated_at.desc&limit=1`,
  );
  return Array.isArray(rows) ? rows[0] : null;
}

async function insert(table: string, body: Json) {
  return supabase(table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
}

async function upsert(table: string, body: Json, conflict = "identity_id") {
  return supabase(`${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(body),
  });
}

async function patch(table: string, filter: string, body: Json) {
  return supabase(`${table}?${filter}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
}

async function patchLead(leadId: string, body: Json) {
  return patch("leads", `id=eq.${encodeURIComponent(leadId)}`, body);
}

async function getOne(table: string, query: string) {
  const rows = await supabase(`${table}?${query}&limit=1`);
  return Array.isArray(rows) ? rows[0] : null;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const identityId = String(body.identityId ?? "").trim();
    const actor = String(body.actor ?? "Administrator").trim() || "Administrator";

    if (!identityId) {
      return NextResponse.json({ error: "identityId is required" }, { status: 400 });
    }

    if (action === "add_note") {
      const note = String(body.note ?? "").trim();
      if (!note) return NextResponse.json({ error: "Note cannot be empty" }, { status: 400 });

      const rows = await insert("crm_notes", {
        identity_id: identityId,
        body: note,
        author: actor,
      });

      return NextResponse.json({ ok: true, message: "Note added", note: Array.isArray(rows) ? rows[0] : rows });
    }

    if (action === "move_stage") {
      const toStage = Number(body.toStage);
      const fromStage = Number(body.fromStage);
      if (!Number.isInteger(toStage) || toStage < 1 || toStage > 10) {
        return NextResponse.json({ error: "toStage must be between 1 and 10" }, { status: 400 });
      }

      await insert("crm_manual_updates", {
        identity_id: identityId,
        update_type: "funnel_stage",
        value: String(toStage),
        note: String(body.note ?? `Moved to ${toStage}. ${stageNames[toStage]}`),
        updated_by: actor,
      });

      await insert("crm_stage_history", {
        identity_id: identityId,
        from_stage: Number.isInteger(fromStage) && fromStage >= 1 && fromStage <= 10 ? fromStage : null,
        to_stage: toStage,
        tracking_type: "Manual",
        changed_by: actor,
      });

      const lead = await latestLead(identityId);
      if (lead?.id) {
        await patchLead(lead.id, {
          funnel_stage: stageSlugs[toStage],
          updated_at: new Date().toISOString(),
        });
      }

      return NextResponse.json({ ok: true, message: `Moved to ${stageNames[toStage]}`, stage: toStage });
    }

    if (action === "whatsapp_outcome") {
      const outcome = String(body.outcome ?? "").trim();
      const allowed = ["Contacted", "Negotiating", "Paid", "Lost"];
      if (!allowed.includes(outcome)) {
        return NextResponse.json({ error: "Invalid WhatsApp outcome" }, { status: 400 });
      }

      await insert("crm_manual_updates", {
        identity_id: identityId,
        update_type: "whatsapp_status",
        value: outcome,
        note: String(body.note ?? `WhatsApp outcome recorded as ${outcome}`),
        updated_by: actor,
      });

      // CRM WhatsApp outcomes are CRM workflow data, not native lead statuses.
      // Keep them in crm_manual_updates so we do not violate the existing
      // leads.status constraint used by the Ambassador / lead-capture backend.
      // Only a confirmed payment changes the shared funnel stage.
      const lead = await latestLead(identityId);
      if (lead?.id && outcome === "Paid") {
        await patchLead(lead.id, {
          funnel_stage: stageSlugs[6],
          updated_at: new Date().toISOString(),
        });
      }

      if (outcome === "Paid") {
        await insert("crm_manual_updates", {
          identity_id: identityId,
          update_type: "funnel_stage",
          value: "6",
          note: "Payment confirmed from WhatsApp handoff",
          updated_by: actor,
        });
        await insert("crm_stage_history", {
          identity_id: identityId,
          from_stage: Number(body.fromStage) || 5,
          to_stage: 6,
          tracking_type: "Manual",
          changed_by: actor,
        });
      }

      return NextResponse.json({ ok: true, message: `WhatsApp outcome: ${outcome}`, outcome });
    }

    if (action === "task_outcome") {
      const taskId = String(body.taskId ?? "").trim();
      const outcome = String(body.outcome ?? "").trim();
      if (!taskId) return NextResponse.json({ error: "taskId is required" }, { status: 400 });
      if (!["Contacted", "No response", "Completed"].includes(outcome)) {
        return NextResponse.json({ error: "Invalid task outcome" }, { status: 400 });
      }

      const task = await getOne(
        "crm_tasks",
        `select=id,identity_id,source_stage,title,status&id=eq.${encodeURIComponent(taskId)}`,
      );
      if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

      const state = await getOne(
        "crm_contact_state",
        `select=*&identity_id=eq.${encodeURIComponent(identityId)}`,
      );

      const now = new Date();
      const isContactAttempt = outcome === "Contacted" || outcome === "No response";
      const attempts = Number(state?.contact_attempt_count ?? 0) + (isContactAttempt ? 1 : 0);
      const cooldownMinutes = attempts <= 1 ? 1440 : attempts === 2 ? 2880 : 5760;
      const dormant = outcome === "No response" && attempts >= 3;

      await patch("crm_tasks", `id=eq.${encodeURIComponent(taskId)}`, {
        status: "completed",
        outcome,
        completed_at: now.toISOString(),
        updated_at: now.toISOString(),
      });

      if (isContactAttempt) {
        await upsert("crm_contact_state", {
          identity_id: identityId,
          last_contacted_at: now.toISOString(),
          next_contact_allowed_at: addMinutes(now, dormant ? 10_080 : cooldownMinutes),
          contact_attempt_count: attempts,
          last_contact_outcome: outcome,
          cooling_until: dormant ? addMinutes(now, 10_080) : null,
          dormant,
          updated_at: now.toISOString(),
        });
      }

      await insert("crm_manual_updates", {
        identity_id: identityId,
        update_type: "contact_outcome",
        value: outcome,
        note: `${task.title || "Follow-up"} — ${outcome}`,
        updated_by: actor,
      });

      if (Number(task.source_stage) === 5 && outcome === "Contacted") {
        await insert("crm_manual_updates", {
          identity_id: identityId,
          update_type: "whatsapp_status",
          value: "Contacted",
          note: "Contacted from CRM follow-up task",
          updated_by: actor,
        });
      }

      return NextResponse.json({
        ok: true,
        message: dormant ? "Lead moved into cooling after 3 unanswered attempts" : `Task recorded: ${outcome}`,
        attempts,
        dormant,
      });
    }

    if (action === "assign_owner") {
      const ownerType = String(body.ownerType ?? "unassigned");
      if (!["ambassador", "admin", "unassigned"].includes(ownerType)) {
        return NextResponse.json({ error: "Invalid owner type" }, { status: 400 });
      }

      await upsert("crm_lead_ownership", {
        identity_id: identityId,
        referrer_identity_id: body.referrerIdentityId || null,
        original_ambassador_id: body.originalAmbassadorId || null,
        generation: body.generation || null,
        owner_type: ownerType,
        owner_id: body.ownerId || null,
        owner_label: String(body.ownerLabel ?? "").trim() || null,
        assigned_by: actor,
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      return NextResponse.json({ ok: true, message: "Lead owner updated" });
    }

    return NextResponse.json({ error: "Unknown CRM action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: "CRM action failed", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
