const DEFAULT_ALLOWED_ORIGINS = [
	"https://blog.guan4tou2.com",
	"http://localhost:4321",
	"http://127.0.0.1:4321",
];

const MAX_PATH_LENGTH = 512;
const MAX_TITLE_LENGTH = 200;
const MAX_RANK_LIMIT = 50;
const MAX_SERIES_DAYS = 90;

export default {
	fetch: handleRequest,
};

export async function handleRequest(request, env = {}, options = {}) {
	const url = new URL(request.url);
	const origin = request.headers.get("origin");

	if (!isAllowedOrigin(origin, env)) {
		return json({ error: "Forbidden origin" }, 403, origin, env);
	}

	if (request.method === "OPTIONS") {
		return new Response(null, {
			status: 204,
			headers: corsHeaders(origin, env),
		});
	}

	if (request.method === "POST" && !origin) {
		return json({ error: "Forbidden origin" }, 403, origin, env);
	}

	try {
		if (url.pathname === "/api/views" && request.method === "POST") {
			return await incrementView(request, env, options);
		}

		if (url.pathname === "/api/views" && request.method === "GET") {
			return await readPageView(url, env, options);
		}

		if (url.pathname === "/api/views/rank" && request.method === "GET") {
			return await readRank(url, env, options);
		}

		if (url.pathname === "/api/views/series" && request.method === "GET") {
			return await readSeries(url, env, options);
		}

		return json({ error: "Not found" }, 404, origin, env);
	} catch (error) {
		const message = error instanceof CounterError ? error.message : "Internal error";
		const status = error instanceof CounterError ? error.status : 500;
		return json({ error: message }, status, origin, env);
	}
}

export function normalizePath(rawPath) {
	if (typeof rawPath !== "string" || rawPath.trim() === "") {
		throw new CounterError("Invalid path", 400);
	}

	const trimmed = rawPath.trim();
	let pathname = trimmed;

	if (/^https?:\/\//i.test(trimmed)) {
		pathname = new URL(trimmed).pathname;
	} else if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
		throw new CounterError("Invalid path", 400);
	} else {
		pathname = trimmed.split("?")[0].split("#")[0];
	}

	try {
		pathname = decodeURI(pathname);
	} catch {
		throw new CounterError("Invalid path", 400);
	}

	if (!pathname.startsWith("/")) {
		pathname = `/${pathname}`;
	}

	if (
		pathname.length > MAX_PATH_LENGTH ||
		pathname.includes("..") ||
		pathname.includes("//") ||
		/[\u0000-\u001f\u007f]/.test(pathname)
	) {
		throw new CounterError("Invalid path", 400);
	}

	return pathname;
}

export function getTaipeiBuckets(now = new Date()) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Taipei",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		hour12: false,
	}).formatToParts(now);

	const get = (type) => parts.find((part) => part.type === type)?.value || "00";
	const day = `${get("year")}-${get("month")}-${get("day")}`;
	return { day, hour: `${day}T${get("hour")}` };
}

export function createD1Store(db) {
	if (!db) {
		throw new CounterError("D1 binding DB is not configured", 500);
	}

	return {
		async incrementView({ path, title, day, hour, nowIso }) {
			await db.batch([
				db
					.prepare(`
						INSERT INTO page_totals (path, title, views, created_at, updated_at)
						VALUES (?, ?, 1, ?, ?)
						ON CONFLICT(path) DO UPDATE SET
							title = COALESCE(excluded.title, page_totals.title),
							views = page_totals.views + 1,
							updated_at = excluded.updated_at
					`)
					.bind(path, title || null, nowIso, nowIso),
				db
					.prepare(`
						INSERT INTO page_daily (path, day, views, updated_at)
						VALUES (?, ?, 1, ?)
						ON CONFLICT(path, day) DO UPDATE SET
							views = page_daily.views + 1,
							updated_at = excluded.updated_at
					`)
					.bind(path, day, nowIso),
				db
					.prepare(`
						INSERT INTO page_hourly (path, hour, views, updated_at)
						VALUES (?, ?, 1, ?)
						ON CONFLICT(path, hour) DO UPDATE SET
							views = page_hourly.views + 1,
							updated_at = excluded.updated_at
					`)
					.bind(path, hour, nowIso),
				db
					.prepare(`
						INSERT INTO site_totals (metric, value, updated_at)
						VALUES ('views', 1, ?)
						ON CONFLICT(metric) DO UPDATE SET
							value = site_totals.value + 1,
							updated_at = excluded.updated_at
					`)
					.bind(nowIso),
			]);

			const [page, site] = await db.batch([
				db
					.prepare("SELECT path, title, views, updated_at FROM page_totals WHERE path = ?")
					.bind(path),
				db.prepare("SELECT value FROM site_totals WHERE metric = 'views'"),
			]);

			const pageRow = page.results?.[0] || { path, title: null, views: 0 };
			const siteViews = Number(site.results?.[0]?.value || 0);
			return {
				path: pageRow.path,
				title: pageRow.title,
				views: Number(pageRow.views || 0),
				siteViews,
			};
		},

		async getPage(path) {
			const row = await db
				.prepare("SELECT path, title, views, updated_at FROM page_totals WHERE path = ?")
				.bind(path)
				.first();
			return row || { path, title: null, views: 0 };
		},

		async getRank({ limit, prefix }) {
			const result = await db
				.prepare(`
					SELECT path, title, views
					FROM page_totals
					WHERE path LIKE ?
					ORDER BY views DESC, path ASC
					LIMIT ?
				`)
				.bind(`${prefix}%`, limit)
				.all();
			return (result.results || []).map((row) => ({
				path: row.path,
				title: row.title,
				views: Number(row.views || 0),
			}));
		},

		async getSeries({ path, bucket, limit }) {
			const table = bucket === "hourly" ? "page_hourly" : "page_daily";
			const column = bucket === "hourly" ? "hour" : "day";
			const result = await db
				.prepare(`
					SELECT ${column} AS bucket, views
					FROM ${table}
					WHERE path = ?
					ORDER BY ${column} DESC
					LIMIT ?
				`)
				.bind(path, limit)
				.all();
			return (result.results || [])
				.map((row) => ({ bucket: row.bucket, views: Number(row.views || 0) }))
				.reverse();
		},
	};
}

async function incrementView(request, env, options) {
	const body = await readJson(request);
	const path = normalizePath(body.path);
	const title = normalizeTitle(body.title);
	const now = options.now || new Date();
	const { day, hour } = getTaipeiBuckets(now);
	const store = getStore(env, options);
	const result = await store.incrementView({
		path,
		title,
		day,
		hour,
		nowIso: now.toISOString(),
	});

	if (env.AE) {
		env.AE.writeDataPoint({
			blobs: [path, result.title || ""],
			doubles: [Number(result.views || 0)],
			indexes: [path],
		});
	}

	return json(
		{
			path: result.path,
			title: result.title,
			views: Number(result.views || 0),
			siteViews: Number(result.siteViews || 0),
		},
		200,
		request.headers.get("origin"),
		env,
	);
}

async function readPageView(url, env, options) {
	const path = normalizePath(url.searchParams.get("path"));
	const result = await getStore(env, options).getPage(path);
	return json(
		{
			path: result.path,
			title: result.title,
			views: Number(result.views || 0),
		},
		200,
		null,
		env,
	);
}

async function readRank(url, env, options) {
	const limit = parseLimit(url.searchParams.get("limit"), MAX_RANK_LIMIT, 10);
	const prefix = normalizePrefix(url.searchParams.get("prefix") || "/posts/");
	const results = await getStore(env, options).getRank({ limit, prefix });
	return json({ results }, 200, null, env);
}

async function readSeries(url, env, options) {
	const path = normalizePath(url.searchParams.get("path"));
	const bucket = url.searchParams.get("bucket") === "hourly" ? "hourly" : "daily";
	const days = parseLimit(url.searchParams.get("days"), MAX_SERIES_DAYS, 30);
	const limit = bucket === "hourly" ? days * 24 : days;
	const results = await getStore(env, options).getSeries({ path, bucket, limit });
	return json({ path, bucket, results }, 200, null, env);
}

async function readJson(request) {
	try {
		return await request.json();
	} catch {
		throw new CounterError("Invalid JSON body", 400);
	}
}

function getStore(env, options) {
	return options.store || env.STORE || createD1Store(env.DB);
}

function normalizeTitle(title) {
	if (typeof title !== "string") return null;
	const trimmed = title.trim();
	if (!trimmed) return null;
	return trimmed.slice(0, MAX_TITLE_LENGTH);
}

function normalizePrefix(prefix) {
	const normalized = normalizePath(prefix);
	return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function parseLimit(value, max, fallback) {
	const parsed = Number.parseInt(value || "", 10);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(Math.max(parsed, 1), max);
}

function json(body, status, origin, env) {
	const headers = corsHeaders(origin, env);
	headers.set("content-type", "application/json; charset=utf-8");
	headers.set("cache-control", "no-store");
	return new Response(JSON.stringify(body), { status, headers });
}

function corsHeaders(origin, env) {
	const headers = new Headers({
		"access-control-allow-methods": "GET,POST,OPTIONS",
		"access-control-allow-headers": "content-type",
		"access-control-max-age": "86400",
		vary: "Origin",
	});

	if (origin && isAllowedOrigin(origin, env)) {
		headers.set("access-control-allow-origin", origin);
	}

	return headers;
}

function isAllowedOrigin(origin, env) {
	if (!origin) return true;
	return getAllowedOrigins(env).has(origin);
}

function getAllowedOrigins(env) {
	const configured = typeof env.ALLOWED_ORIGINS === "string"
		? env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
		: [];
	return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

class CounterError extends Error {
	constructor(message, status) {
		super(message);
		this.status = status;
	}
}
