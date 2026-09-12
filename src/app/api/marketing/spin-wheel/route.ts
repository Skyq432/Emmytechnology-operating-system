import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canAccessModule, isInternalRole } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

const db = new Proxy(
  {} as ReturnType<typeof getSupabaseAdmin>,
  {
    get(_target, property) {
      const client = getSupabaseAdmin();
      const value = client[property as keyof typeof client];
      return typeof value === "function" ? value.bind(client) : value;
    },
  }
);

const MAX_ROWS = 5000;

type Row = Record<string, unknown>;
type SafeRowsResult = { rows: Row[]; warning: string | null };

async function authorized() {
  const supabase = await createServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return false;

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return (
    !profileError &&
    isInternalRole(profile?.role) &&
    canAccessModule(profile.role, "marketing")
  );
}

function deny() {
  return NextResponse.json(
    { ok: false, error: "Marketing workspace access is required." },
    { status: 401 }
  );
}

function numberValue(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textValue(value: unknown) {
  return String(value ?? "").trim();
}

function timestampOf(row: Row) {
  const value =
    row.created_at ??
    row.createdAt ??
    row.updated_at ??
    row.updatedAt ??
    null;

  if (typeof value !== "string" && typeof value !== "number") return 0;

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function newestFirst(rows: Row[]) {
  return [...rows].sort((a, b) => timestampOf(b) - timestampOf(a));
}

function within(rows: Row[], fromIso: string, toIso: string) {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();

  return rows.filter((row) => {
    const time = timestampOf(row);
    return time >= from && time <= to;
  });
}

async function safeRows(
  table: string,
  limit = MAX_ROWS
): Promise<SafeRowsResult> {
  try {
    const { data, error } = await db.from(table).select("*").limit(limit);

    if (error) {
      return {
        rows: [],
        warning: `${table}: ${error.message}`,
      };
    }

    return {
      rows: Array.isArray(data) ? data : [],
      warning: null,
    };
  } catch (error) {
    return {
      rows: [],
      warning: `${table}: ${
        error instanceof Error ? error.message : "Unable to read table"
      }`,
    };
  }
}

function tableIsAvailable(result: SafeRowsResult) {
  return !result.warning;
}

function hasColumn(rows: Row[], column: string) {
  return rows.some((row) => Object.prototype.hasOwnProperty.call(row, column));
}

function rowPlayerId(row: Row) {
  return row.spin_player_id ?? row.player_id ?? null;
}

function rowReferralId(row: Row) {
  return row.referral_id ?? row.spin_referral_id ?? null;
}

function rowReferralCode(row: Row) {
  return row.referral_code ?? row.code ?? null;
}

function rowPhone(row: Row) {
  return row.phone ?? row.phone_number ?? null;
}

function rowEmail(row: Row) {
  return row.email ?? null;
}

function rowPrizeAmount(row: Row) {
  return numberValue(row.prize_amount ?? row.amount ?? row.value ?? 0);
}

function rowCashOffAmount(row: Row) {
  return numberValue(
    row.cash_off_amount ?? row.cashoff_amount ?? row.cash_off_value ?? 0
  );
}

function rowPlayerName(row: Row) {
  return textValue(row.full_name ?? row.name ?? row.customer_name ?? "");
}

function rowPlayerContact(row: Row) {
  return textValue(rowPhone(row) ?? rowEmail(row) ?? "");
}

function normalizeStatus(value: unknown) {
  return textValue(value).toLowerCase();
}

function truthy(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

async function tableRows(table: string, limit = MAX_ROWS) {
  return safeRows(table, limit);
}

export async function GET(req: NextRequest) {
  if (!(await authorized())) return deny();

  const { searchParams } = new URL(req.url);
  const fromIso = searchParams.get("from") || "1970-01-01T00:00:00.000Z";
  const toIso = searchParams.get("to") || new Date().toISOString();

  const [
    playersResult,
    logsResult,
    prizesResult,
    transactionsResult,
    referralsResult,
    cashoutsResult,
    clicksResult,
    userPrizesResult,
    referralAwardsResult,
    rulesResult,
    ruleItemsResult,
    gameSettingsResult,
    segmentsResult,
  ] = await Promise.all([
    tableRows("spin_players"),
    tableRows("spin_logs"),
    tableRows("spin_prizes"),
    tableRows("spin_transactions"),
    tableRows("spin_referrals"),
    tableRows("spin_cashout_requests"),
    tableRows("spin_dm_clicks"),
    tableRows("spin_user_prizes"),
    tableRows("spin_referral_awards"),
    tableRows("spin_rule_groups"),
    tableRows("spin_rule_items"),
    tableRows("spin_game_settings"),
    tableRows("spin_letter_segments"),
  ]);

  const warnings = [
    playersResult.warning,
    logsResult.warning,
    prizesResult.warning,
    transactionsResult.warning,
    referralsResult.warning,
    cashoutsResult.warning,
    clicksResult.warning,
    userPrizesResult.warning,
    referralAwardsResult.warning,
    rulesResult.warning,
    ruleItemsResult.warning,
    gameSettingsResult.warning,
    segmentsResult.warning,
  ].filter(Boolean);

  const players = playersResult.rows;
  const logs = logsResult.rows;
  const prizes = prizesResult.rows;
  const transactions = transactionsResult.rows;
  const referrals = referralsResult.rows;
  const cashouts = cashoutsResult.rows;
  const clicks = clicksResult.rows;
  const userPrizes = userPrizesResult.rows;
  const referralAwards = referralAwardsResult.rows;
  const ruleGroups = rulesResult.rows;
  const ruleItems = ruleItemsResult.rows;
  const gameSettings = gameSettingsResult.rows;
  const letterSegments = segmentsResult.rows;

  const periodLogs = within(logs, fromIso, toIso);
  const periodTransactions = within(transactions, fromIso, toIso);
  const periodReferrals = within(referrals, fromIso, toIso);
  const periodCashouts = within(cashouts, fromIso, toIso);
  const periodClicks = within(clicks, fromIso, toIso);

  const totalPrize = periodTransactions.reduce(
    (sum, row) => sum + rowPrizeAmount(row),
    0
  );
  const totalCashOff = periodTransactions.reduce(
    (sum, row) => sum + rowCashOffAmount(row),
    0
  );

  const successfulCashouts = periodCashouts.filter((row) =>
    ["paid", "approved", "completed", "success"].includes(
      normalizeStatus(row.status)
    )
  );

  const referralPlayerIds = new Set(
    periodReferrals.map((row) => String(rowPlayerId(row) ?? "")).filter(Boolean)
  );

  const activePlayerIds = new Set(
    periodLogs.map((row) => String(rowPlayerId(row) ?? "")).filter(Boolean)
  );

  const playerById = new Map(
    players.map((row) => [String(row.id ?? ""), row] as const)
  );

  const recentActivity = newestFirst([
    ...periodLogs.map((row) => ({
      kind: "spin",
      created_at: row.created_at,
      player_id: rowPlayerId(row),
      description: textValue(
        row.description ?? row.event ?? row.result ?? row.prize_name ?? "Spin"
      ),
      amount: rowPrizeAmount(row),
      raw: row,
    })),
    ...periodCashouts.map((row) => ({
      kind: "cashout",
      created_at: row.created_at,
      player_id: rowPlayerId(row),
      description: `Cashout ${textValue(row.status || "request")}`,
      amount: numberValue(row.amount ?? row.cashout_amount),
      raw: row,
    })),
    ...periodReferrals.map((row) => ({
      kind: "referral",
      created_at: row.created_at,
      player_id: rowPlayerId(row),
      description: "Referral activity",
      amount: 0,
      raw: row,
    })),
    ...periodClicks.map((row) => ({
      kind: "dm_click",
      created_at: row.created_at,
      player_id: rowPlayerId(row),
      description: "DM click",
      amount: 0,
      raw: row,
    })),
  ]).slice(0, 100);

  const topPlayers = players
    .map((player) => {
      const id = String(player.id ?? "");
      const playerLogs = periodLogs.filter(
        (row) => String(rowPlayerId(row) ?? "") === id
      );
      const playerTransactions = periodTransactions.filter(
        (row) => String(rowPlayerId(row) ?? "") === id
      );
      const playerReferrals = periodReferrals.filter(
        (row) => String(rowPlayerId(row) ?? "") === id
      );
      const playerCashouts = periodCashouts.filter(
        (row) => String(rowPlayerId(row) ?? "") === id
      );
      const score =
        playerLogs.length * 2 +
        playerReferrals.length * 8 +
        playerCashouts.filter((row) =>
          ["paid", "approved", "completed", "success"].includes(
            normalizeStatus(row.status)
          )
        ).length * 12 +
        playerTransactions.reduce(
          (sum, row) => sum + rowPrizeAmount(row) / 100,
          0
        );

      return {
        id,
        name: rowPlayerName(player),
        contact: rowPlayerContact(player),
        spins: playerLogs.length,
        referrals: playerReferrals.length,
        cashouts: playerCashouts.length,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);

  const currentRules = ruleGroups.map((group) => ({
    ...group,
    items: ruleItems.filter(
      (item) => String(item.rule_group_id ?? "") === String(group.id ?? "")
    ),
  }));

  const prizeMap = new Map(
    prizes.map((row) => [String(row.id ?? ""), row] as const)
  );

  const recentPrizeAwards = newestFirst(userPrizes)
    .slice(0, 100)
    .map((award) => ({
      ...award,
      prize:
        prizeMap.get(String(award.prize_id ?? award.spin_prize_id ?? "")) ??
        null,
    }));

  return NextResponse.json({
    ok: true,
    period: { from: fromIso, to: toIso },
    warnings,
    summary: {
      totalPlayers: players.length,
      activePlayers: activePlayerIds.size,
      totalSpins: periodLogs.length,
      totalPrize,
      totalCashOff,
      referrals: periodReferrals.length,
      referralPlayers: referralPlayerIds.size,
      cashoutRequests: periodCashouts.length,
      successfulCashouts: successfulCashouts.length,
      dmClicks: periodClicks.length,
    },
    players,
    topPlayers,
    recentActivity,
    recentPrizeAwards,
    currentRules,
    gameSettings,
    letterSegments,
    referralAwards,
    tableAvailability: {
      spin_players: tableIsAvailable(playersResult),
      spin_logs: tableIsAvailable(logsResult),
      spin_prizes: tableIsAvailable(prizesResult),
      spin_transactions: tableIsAvailable(transactionsResult),
      spin_referrals: tableIsAvailable(referralsResult),
      spin_cashout_requests: tableIsAvailable(cashoutsResult),
      spin_dm_clicks: tableIsAvailable(clicksResult),
      spin_user_prizes: tableIsAvailable(userPrizesResult),
      spin_referral_awards: tableIsAvailable(referralAwardsResult),
      spin_rule_groups: tableIsAvailable(rulesResult),
      spin_rule_items: tableIsAvailable(ruleItemsResult),
      spin_game_settings: tableIsAvailable(gameSettingsResult),
      spin_letter_segments: tableIsAvailable(segmentsResult),
    },
  });
}

export async function POST(req: NextRequest) {
  if (!(await authorized())) return deny();

  const body = (await req.json().catch(() => ({}))) as Row;
  const action = textValue(body.action);

  if (!action) {
    return NextResponse.json(
      { ok: false, error: "Action is required." },
      { status: 400 }
    );
  }

  if (action === "update_game_settings") {
    const payload = body.payload || {};
    const { error } = await db
      .from("spin_game_settings")
      .update(payload)
      .eq("id", body.id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "update_prize") {
    const { error } = await db
      .from("spin_prizes")
      .update(body.payload || {})
      .eq("id", body.id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "update_rule_group") {
    const { error } = await db
      .from("spin_rule_groups")
      .update(body.payload || {})
      .eq("id", body.id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "update_rule_item") {
    const { error } = await db
      .from("spin_rule_items")
      .update(body.payload || {})
      .eq("id", body.id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { ok: false, error: "Unsupported action." },
    { status: 400 }
  );
}