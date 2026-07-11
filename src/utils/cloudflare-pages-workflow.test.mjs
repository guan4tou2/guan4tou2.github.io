import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const workflow = readFileSync(".github/workflows/cloudflare-pages.yml", "utf8");

test("deploys the static build to Cloudflare Pages", () => {
	assert.match(workflow, /name:\s*Deploy to Cloudflare Pages/);
	assert.match(
		workflow,
		/pnpm dlx wrangler@4\.110\.0 pages deploy dist --project-name=guan4tou2-blog --branch=main/,
	);
	assert.doesNotMatch(workflow, /actions\/deploy-pages|withastro\/action/);
});

test("skips deployment when the Cloudflare API token secret is not configured", () => {
	assert.match(workflow, /secrets\.CLOUDFLARE_API_TOKEN/);
	assert.match(workflow, /has_token=false/);
	assert.match(workflow, /steps\.cloudflare_token\.outputs\.has_token == 'true'/);
});
