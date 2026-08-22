const STEAM_ENDPOINT =
  "https://partner.steam-api.com/IPartnerFinancialsService/GetAppWishlistReporting/v001/";
const INTERNAL_PREFIX = "/internal/wishlists";
const MAX_BACKFILL_DAYS_PER_RUN = 20;

type WishlistSummary = {
  wishlist_adds?: number;
  wishlist_deletes?: number;
  wishlist_purchases?: number;
  wishlist_gifts?: number;
};

type SteamResponse = {
  date?: string;
  wishlist_summary?: WishlistSummary;
  app_min_date?: string;
  time_generated?: number;
};

type SteamEnvelope = {
  response?: SteamResponse;
};

type SyncStatus = {
  app_min_date: string | null;
  last_checked_at: string | null;
  last_error: string | null;
};

type Totals = {
  adds: number;
  deletes: number;
  purchases: number;
  gifts: number;
};

type DailyRow = Totals & {
  date: string;
};

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/internal/")) {
      return env.ASSETS.fetch(request);
    }

    if (!(await isAuthorized(request, env.DASHBOARD_PASSWORD))) {
      return new Response("Authentication required", {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
          "WWW-Authenticate": 'Basic realm="Qilvo collaborators", charset="UTF-8"',
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if (url.pathname === INTERNAL_PREFIX || url.pathname === `${INTERNAL_PREFIX}/`) {
      return env.ASSETS.fetch(request);
    }
    if (url.pathname === `${INTERNAL_PREFIX}/index.html`) {
      return env.ASSETS.fetch(request);
    }
    if (url.pathname === `${INTERNAL_PREFIX}/api/dashboard`) {
      if (request.method !== "GET") {
        return json({ error: "Method not allowed" }, 405);
      }
      return dashboard(env);
    }
    if (url.pathname === `${INTERNAL_PREFIX}/api/refresh`) {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405);
      }
      try {
        await syncWishlist(env);
        return json({ ok: true });
      } catch (error: unknown) {
        return json({ error: safeError(error) }, 502);
      }
    }
    return new Response("Not found", { status: 404 });
  },

  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(
      syncWishlist(env).catch((error: unknown) => {
        console.error(JSON.stringify({ event: "wishlist_sync_failed", error: safeError(error) }));
      }),
    );
  },
} satisfies ExportedHandler<Env>;

async function syncWishlist(env: Env): Promise<void> {
  if (!env.STEAM_WEB_API_KEY) {
    throw new Error("STEAM_WEB_API_KEY secret is missing");
  }

  const today = utcDate(new Date());
  const yesterday = addDays(today, -1);
  const status = await env.DB.prepare(
    "SELECT app_min_date, last_checked_at, last_error FROM sync_status WHERE singleton = 1 LIMIT 1",
  ).first<SyncStatus>();

  const dates = new Set<string>([yesterday, today]);
  if (status?.app_min_date) {
    const missing = await missingDates(env.DB, status.app_min_date, yesterday);
    for (const date of missing.slice(0, MAX_BACKFILL_DAYS_PER_RUN)) {
      dates.add(date);
    }
  }

  try {
    let minimumDate = status?.app_min_date ?? null;
    for (const date of [...dates].sort()) {
      const response = await fetchSteamDay(env, date);
      minimumDate ||= response.app_min_date ?? null;
      await storeDay(env.DB, date, response);
    }
    await env.DB.prepare(
      "UPDATE sync_status SET app_min_date = COALESCE(?1, app_min_date), last_checked_at = ?2, last_error = NULL WHERE singleton = 1",
    )
      .bind(minimumDate, new Date().toISOString())
      .run();
    console.log(JSON.stringify({ event: "wishlist_sync_complete", dates: dates.size }));
  } catch (error: unknown) {
    const message = safeError(error);
    await env.DB.prepare(
      "UPDATE sync_status SET last_checked_at = ?1, last_error = ?2 WHERE singleton = 1",
    )
      .bind(new Date().toISOString(), message)
      .run();
    throw error;
  }
}

async function fetchSteamDay(env: Env, date: string): Promise<SteamResponse> {
  const url = new URL(STEAM_ENDPOINT);
  url.searchParams.set("key", env.STEAM_WEB_API_KEY);
  url.searchParams.set("appid", env.STEAM_APP_ID);
  url.searchParams.set("date", date);

  const response = await fetch(url, {
    headers: { "User-Agent": "Qilvo-Wishlist-Dashboard/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Steam API returned HTTP ${response.status}`);
  }

  const envelope = (await response.json()) as SteamEnvelope;
  if (!envelope.response) {
    throw new Error("Steam API returned an invalid response");
  }
  return envelope.response;
}

async function storeDay(db: D1Database, requestedDate: string, response: SteamResponse): Promise<void> {
  const summary = response.wishlist_summary ?? {};
  await db
    .prepare(
      `INSERT INTO daily_wishlists
       (date, adds, deletes, purchases, gifts, steam_generated_at, fetched_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT(date) DO UPDATE SET
         adds = excluded.adds,
         deletes = excluded.deletes,
         purchases = excluded.purchases,
         gifts = excluded.gifts,
         steam_generated_at = excluded.steam_generated_at,
         fetched_at = excluded.fetched_at`,
    )
    .bind(
      response.date || requestedDate,
      summary.wishlist_adds ?? 0,
      summary.wishlist_deletes ?? 0,
      summary.wishlist_purchases ?? 0,
      summary.wishlist_gifts ?? 0,
      response.time_generated ?? 0,
      new Date().toISOString(),
    )
    .run();
}

async function missingDates(db: D1Database, firstDate: string, lastDate: string): Promise<string[]> {
  const existing = await db
    .prepare("SELECT date FROM daily_wishlists WHERE date BETWEEN ?1 AND ?2")
    .bind(firstDate, lastDate)
    .all<{ date: string }>();
  const known = new Set(existing.results.map((row) => row.date));
  const result: string[] = [];
  for (let date = firstDate; date <= lastDate; date = addDays(date, 1)) {
    if (!known.has(date)) {
      result.push(date);
    }
  }
  return result;
}

async function dashboard(env: Env): Promise<Response> {
  const [totals, status, generated, days] = await Promise.all([
    env.DB.prepare(
      `SELECT COALESCE(SUM(adds), 0) AS adds,
              COALESCE(SUM(deletes), 0) AS deletes,
              COALESCE(SUM(purchases), 0) AS purchases,
              COALESCE(SUM(gifts), 0) AS gifts
       FROM daily_wishlists`,
    ).first<Totals>(),
    env.DB.prepare(
      "SELECT app_min_date, last_checked_at, last_error FROM sync_status WHERE singleton = 1 LIMIT 1",
    ).first<SyncStatus>(),
    env.DB.prepare(
      "SELECT MAX(NULLIF(steam_generated_at, 0)) AS timestamp FROM daily_wishlists",
    ).first<{ timestamp: number | null }>(),
    env.DB.prepare(
      `SELECT date, adds, deletes, purchases, gifts
       FROM daily_wishlists ORDER BY date DESC LIMIT 90`,
    ).all<DailyRow>(),
  ]);

  const values = totals ?? { adds: 0, deletes: 0, purchases: 0, gifts: 0 };
  return json(
    {
      app_id: env.STEAM_APP_ID,
      outstanding: values.adds - values.deletes - values.purchases,
      lifetime_adds: values.adds,
      lifetime_deletes: values.deletes,
      lifetime_purchases: values.purchases,
      lifetime_gifts: values.gifts,
      last_checked_at: status?.last_checked_at ?? null,
      steam_generated_at: generated?.timestamp
        ? new Date(generated.timestamp * 1000).toISOString()
        : null,
      last_error: status?.last_error ?? null,
      days: days.results.reverse().map((day) => ({
        ...day,
        net: day.adds - day.deletes - day.purchases,
      })),
    },
    200,
    { "Cache-Control": "private, max-age=30" },
  );
}

function json(value: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, amount: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return utcDate(parsed);
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.replace(/key=[^&\s]+/gi, "key=[redacted]") : "Unknown error";
}

async function isAuthorized(request: Request, expectedPassword: string): Promise<boolean> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Basic ")) {
    return false;
  }

  try {
    const decoded = atob(authorization.slice("Basic ".length));
    const separator = decoded.indexOf(":");
    if (separator < 0 || decoded.slice(0, separator) !== "qilvo") {
      return false;
    }
    return timingSafeEqual(decoded.slice(separator + 1), expectedPassword);
  } catch {
    return false;
  }
}

async function timingSafeEqual(actual: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const actualBytes = new Uint8Array(actualHash);
  const expectedBytes = new Uint8Array(expectedHash);
  let difference = actualBytes.length ^ expectedBytes.length;
  for (let index = 0; index < actualBytes.length; index += 1) {
    difference |= actualBytes[index]! ^ expectedBytes[index]!;
  }
  return difference === 0;
}
