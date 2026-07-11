import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	getTaipeiBuckets,
	handleRequest,
	normalizePath,
} from "../src/index.js";

function createMemoryStore() {
	const totals = new Map();
	const daily = new Map();
	const hourly = new Map();
	let siteViews = 0;

	const incrementBucket = (map, key) => {
		map.set(key, (map.get(key) || 0) + 1);
	};

	return {
		async incrementView({ path, title, day, hour, nowIso }) {
			const existing = totals.get(path) || {
				path,
				title: null,
				views: 0,
				updated_at: nowIso,
			};
			const next = {
				...existing,
				title: title || existing.title,
				views: existing.views + 1,
				updated_at: nowIso,
			};
			totals.set(path, next);
			incrementBucket(daily, `${path}\u0000${day}`);
			incrementBucket(hourly, `${path}\u0000${hour}`);
			siteViews += 1;
			return { ...next, siteViews };
		},

		async getPage(path) {
			return totals.get(path) || { path, title: null, views: 0 };
		},

		async getRank({ limit, prefix }) {
			return [...totals.values()]
				.filter((row) => row.path.startsWith(prefix))
				.sort((a, b) => b.views - a.views || a.path.localeCompare(b.path))
				.slice(0, limit)
				.map(({ path, title, views }) => ({ path, title, views }));
		},

		async getSeries({ path, bucket, limit }) {
			const source = bucket === "hourly" ? hourly : daily;
			return [...source.entries()]
				.filter(([key]) => key.startsWith(`${path}\u0000`))
				.map(([key, views]) => ({ bucket: key.split("\u0000")[1], views }))
				.sort((a, b) => a.bucket.localeCompare(b.bucket))
				.slice(-limit);
		},
	};
}

const env = {
	ALLOWED_ORIGINS: "https://blog.guan4tou2.com,http://localhost:4321",
};

describe("view counter worker", () => {
	it("normalizes only safe URL paths", () => {
		assert.equal(
			normalizePath("https://blog.guan4tou2.com/posts/oscp-journey/?x=1#top"),
			"/posts/oscp-journey/",
		);
		assert.equal(normalizePath("/posts/oscp-journey"), "/posts/oscp-journey");
		assert.throws(() => normalizePath("javascript:alert(1)"), /Invalid path/);
		assert.throws(() => normalizePath("/../secret"), /Invalid path/);
	});

	it("builds Taipei day and hour buckets", () => {
		assert.deepEqual(getTaipeiBuckets(new Date("2026-07-03T16:30:00Z")), {
			day: "2026-07-04",
			hour: "2026-07-04T00",
		});
	});

	it("answers CORS preflight for the blog origin", async () => {
		const response = await handleRequest(
			new Request("https://counter.example.com/api/views", {
				method: "OPTIONS",
				headers: { origin: "https://blog.guan4tou2.com" },
			}),
			env,
			{ store: createMemoryStore() },
		);

		assert.equal(response.status, 204);
		assert.equal(
			response.headers.get("access-control-allow-origin"),
			"https://blog.guan4tou2.com",
		);
		assert.match(response.headers.get("access-control-allow-methods") || "", /POST/);
	});

	it("increments a page view and returns the current page and site totals", async () => {
		const store = createMemoryStore();
		const makeRequest = () =>
			new Request("https://counter.example.com/api/views", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "https://blog.guan4tou2.com",
				},
				body: JSON.stringify({
					path: "/posts/oscp-journey/",
					title: "OSCP Journey",
				}),
			});

		const first = await handleRequest(makeRequest(), env, {
			store,
			now: new Date("2026-07-03T15:00:00Z"),
		});
		assert.equal(first.status, 200);
		assert.deepEqual(await first.json(), {
			path: "/posts/oscp-journey/",
			title: "OSCP Journey",
			views: 1,
			siteViews: 1,
		});

		const second = await handleRequest(makeRequest(), env, {
			store,
			now: new Date("2026-07-03T15:05:00Z"),
		});
		assert.deepEqual(await second.json(), {
			path: "/posts/oscp-journey/",
			title: "OSCP Journey",
			views: 2,
			siteViews: 2,
		});
	});

	it("rejects untrusted browser origins", async () => {
		const response = await handleRequest(
			new Request("https://counter.example.com/api/views", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "https://evil.example",
				},
				body: JSON.stringify({ path: "/posts/oscp-journey/" }),
			}),
			env,
			{ store: createMemoryStore() },
		);

		assert.equal(response.status, 403);
	});

	it("requires a browser origin for mutating requests", async () => {
		const response = await handleRequest(
			new Request("https://counter.example.com/api/views", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ path: "/posts/oscp-journey/" }),
			}),
			env,
			{ store: createMemoryStore() },
		);

		assert.equal(response.status, 403);
	});

	it("requires Turnstile token when a secret is configured", async () => {
		const store = createMemoryStore();
		const response = await handleRequest(
			new Request("https://counter.example.com/api/views", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "https://blog.guan4tou2.com",
				},
				body: JSON.stringify({ path: "/posts/oscp-journey/" }),
			}),
			{ ...env, TURNSTILE_SECRET_KEY: "secret" },
			{ store },
		);

		assert.equal(response.status, 403);
		assert.equal((await store.getPage("/posts/oscp-journey/")).views, 0);
	});

	it("rejects failed Turnstile verification without incrementing", async () => {
		const store = createMemoryStore();
		const response = await handleRequest(
			new Request("https://counter.example.com/api/views", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "https://blog.guan4tou2.com",
					"cf-connecting-ip": "203.0.113.10",
				},
				body: JSON.stringify({
					path: "/posts/oscp-journey/",
					turnstileToken: "bad-token",
				}),
			}),
			{ ...env, TURNSTILE_SECRET_KEY: "secret" },
			{
				store,
				verifyTurnstile: async ({ token, remoteIp }) => {
					assert.equal(token, "bad-token");
					assert.equal(remoteIp, "203.0.113.10");
					return { success: false, errors: ["invalid-input-response"] };
				},
			},
		);

		assert.equal(response.status, 403);
		assert.deepEqual(await response.json(), {
			error: "Turnstile verification failed",
		});
		assert.equal((await store.getPage("/posts/oscp-journey/")).views, 0);
	});

	it("rejects Turnstile tokens issued for another hostname", async () => {
		const store = createMemoryStore();
		const response = await handleRequest(
			new Request("https://counter.example.com/api/views", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "https://blog.guan4tou2.com",
				},
				body: JSON.stringify({
					path: "/posts/oscp-journey/",
					turnstileToken: "wrong-host-token",
				}),
			}),
			{ ...env, TURNSTILE_SECRET_KEY: "secret" },
			{
				store,
				verifyTurnstile: async () => ({
					success: true,
					hostname: "evil.example",
					action: "view-counter",
				}),
			},
		);

		assert.equal(response.status, 403);
		assert.equal((await store.getPage("/posts/oscp-journey/")).views, 0);
	});

	it("rejects Turnstile tokens issued for another action", async () => {
		const store = createMemoryStore();
		const response = await handleRequest(
			new Request("https://counter.example.com/api/views", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "https://blog.guan4tou2.com",
				},
				body: JSON.stringify({
					path: "/posts/oscp-journey/",
					turnstileToken: "wrong-action-token",
				}),
			}),
			{ ...env, TURNSTILE_SECRET_KEY: "secret" },
			{
				store,
				verifyTurnstile: async () => ({
					success: true,
					hostname: "blog.guan4tou2.com",
					action: "comment-form",
				}),
			},
		);

		assert.equal(response.status, 403);
		assert.equal((await store.getPage("/posts/oscp-journey/")).views, 0);
	});

	it("increments only after successful Turnstile verification", async () => {
		const store = createMemoryStore();
		let verificationCalls = 0;
		const response = await handleRequest(
			new Request("https://counter.example.com/api/views", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "https://blog.guan4tou2.com",
					"cf-connecting-ip": "203.0.113.10",
				},
				body: JSON.stringify({
					path: "/posts/oscp-journey/",
					title: "OSCP Journey",
					turnstileToken: "ok-token",
				}),
			}),
			{ ...env, TURNSTILE_SECRET_KEY: "secret" },
			{
				store,
				now: new Date("2026-07-03T15:00:00Z"),
				verifyTurnstile: async ({ token, secret, remoteIp }) => {
					verificationCalls += 1;
					assert.equal(token, "ok-token");
					assert.equal(secret, "secret");
					assert.equal(remoteIp, "203.0.113.10");
					return {
						success: true,
						hostname: "blog.guan4tou2.com",
						action: "view-counter",
					};
				},
			},
		);

		assert.equal(response.status, 200);
		assert.equal(verificationCalls, 1);
		assert.deepEqual(await response.json(), {
			path: "/posts/oscp-journey/",
			title: "OSCP Journey",
			views: 1,
			siteViews: 1,
		});
	});

	it("returns page totals, rankings, and time series", async () => {
		const store = createMemoryStore();
		const post = async (path, title, now) =>
			handleRequest(
				new Request("https://counter.example.com/api/views", {
					method: "POST",
					headers: {
						"content-type": "application/json",
						origin: "https://blog.guan4tou2.com",
					},
					body: JSON.stringify({ path, title }),
				}),
				env,
				{ store, now },
			);

		await post("/posts/oscp-journey/", "OSCP Journey", new Date("2026-07-03T15:00:00Z"));
		await post("/posts/oscp-journey/", "OSCP Journey", new Date("2026-07-03T16:30:00Z"));
		await post("/posts/other/", "Other", new Date("2026-07-03T17:00:00Z"));

		const page = await handleRequest(
			new Request("https://counter.example.com/api/views?path=/posts/oscp-journey/"),
			env,
			{ store },
		);
		assert.deepEqual(await page.json(), {
			path: "/posts/oscp-journey/",
			title: "OSCP Journey",
			views: 2,
		});

		const rank = await handleRequest(
			new Request("https://counter.example.com/api/views/rank?limit=2"),
			env,
			{ store },
		);
		assert.deepEqual(await rank.json(), {
			results: [
				{ path: "/posts/oscp-journey/", title: "OSCP Journey", views: 2 },
				{ path: "/posts/other/", title: "Other", views: 1 },
			],
		});

		const series = await handleRequest(
			new Request(
				"https://counter.example.com/api/views/series?path=/posts/oscp-journey/&bucket=hourly&days=1",
			),
			env,
			{ store },
		);
		assert.deepEqual(await series.json(), {
			path: "/posts/oscp-journey/",
			bucket: "hourly",
			results: [
				{ bucket: "2026-07-03T23", views: 1 },
				{ bucket: "2026-07-04T00", views: 1 },
			],
		});
	});
});
