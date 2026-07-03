# Cloudflare D1 View Counter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a first-party blog view counter backed by Cloudflare Worker + D1 while keeping Cloudflare Web Analytics for dashboard analytics.

**Architecture:** The static Astro blog sends a small POST request from article pages to a standalone Worker API. The Worker stores page totals plus daily and hourly aggregates in D1, and exposes read endpoints for per-page count, rankings, and time-series data.

**Tech Stack:** Astro, plain browser JavaScript, Cloudflare Workers, Cloudflare D1, Wrangler, Node built-in test runner.

### Task 1: Worker API Tests

**Files:**
- Create: `workers/view-counter/test/counter.test.mjs`
- Create: `workers/view-counter/src/index.js`

**Steps:**
1. Write Node tests for path validation, CORS OPTIONS, POST increment, GET page count, ranking, and series endpoints.
2. Run `node --test workers/view-counter/test/counter.test.mjs` and confirm it fails because implementation is missing.
3. Implement the minimum Worker functions with an injectable mock D1 database.
4. Re-run the test and confirm it passes.

### Task 2: D1 Schema

**Files:**
- Create: `workers/view-counter/migrations/0001_initial.sql`
- Create: `workers/view-counter/wrangler.jsonc`

**Steps:**
1. Add D1 tables for `page_totals`, `page_daily`, `page_hourly`, and `site_totals`.
2. Add indexes for ranking and time-series queries.
3. Configure Wrangler with a placeholder D1 binding named `DB`.
4. Later, replace the placeholder `database_id` after `wrangler d1 create`.

### Task 3: Blog Frontend

**Files:**
- Modify: `src/types/config.ts`
- Modify: `src/config.ts`
- Modify: `src/components/widget/Profile.astro`
- Create: `src/components/ViewCounter.astro`
- Modify: `src/pages/posts/[...slug].astro`

**Steps:**
1. Replace the Moe-Counter config shape with a first-party `viewCounter` config.
2. Remove the external `count.getloli.com` image from the profile card.
3. Add a post metadata view counter component that POSTs once per page load and updates text when the API returns.
4. Build and check the Astro site.

### Task 4: Cloudflare Deploy

**Files:**
- Modify: `workers/view-counter/wrangler.jsonc` after D1 creation

**Steps:**
1. Run `npx wrangler whoami`.
2. Create D1 database `blog_view_counter` if needed.
3. Apply D1 migrations remotely.
4. Deploy the Worker.
5. Configure the frontend endpoint to the deployed Worker URL or route.
6. Build, commit, push, and verify live HTML includes the view counter script.
