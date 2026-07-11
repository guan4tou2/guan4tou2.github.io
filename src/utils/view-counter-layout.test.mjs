import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const layoutSource = new URL("../layouts/Layout.astro", import.meta.url);

describe("view counter client script", () => {
	it("does not show an interactive Turnstile challenge for article view counts", async () => {
		const source = await readFile(layoutSource, "utf8");

		assert.match(source, /"before-interactive-callback"/);
		assert.match(source, /fetchCurrentViews/);
	});
});
