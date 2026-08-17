/**
 * Structural check on the generated n8n workflow.
 *
 * Catches the failure modes that otherwise only show up after you have
 * imported the JSON into n8n and clicked Execute: a Code node with a syntax
 * error, a connection pointing at a renamed node, an unreachable stage, or —
 * most importantly — a prompt or evidence matcher that has drifted from the
 * shared contract.
 *
 *   npm run verify:workflow
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

import {
  OUTPUT_JSON_SCHEMA,
  SYSTEM_PROMPT,
} from "../src/contract/analysis-contract.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const workflowPath = join(root, "n8n", "sentiment-analyzer.workflow.json");

const failures = [];
const check = (label, condition, detail) => {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failures.push(label);
  }
};

console.log(`Verifying ${workflowPath}\n`);

let workflow;
try {
  workflow = JSON.parse(readFileSync(workflowPath, "utf8"));
} catch (error) {
  console.error(
    `  ✗ workflow JSON does not parse — run \`npm run build:workflow\`\n    ${error}`,
  );
  process.exit(1);
}

const names = new Set(workflow.nodes.map((n) => n.name));
const byName = new Map(workflow.nodes.map((n) => [n.name, n]));

/* ── structure ───────────────────────────────────────────────────────────── */

check("workflow JSON parses", true);
check(
  "has a webhook entry point",
  workflow.nodes.some((n) => n.type === "n8n-nodes-base.webhook"),
);
check(
  "responds on both the success and the error branch",
  workflow.nodes.filter((n) => n.type === "n8n-nodes-base.respondToWebhook").length >= 2,
);

// The pipeline is the point — assert each responsibility is its own stage.
const REQUIRED_STAGES = [
  "Authenticate",
  "Validate input",
  "Normalise & parse conversation",
  "Build Gemini request",
  "Gemini — analyse call",
  "Parse & schema-validate",
  "Verify evidence",
  "KPI engine",
  "Quality gate",
  "Format response",
];
const absent = REQUIRED_STAGES.filter((s) => !names.has(s));
check("every pipeline stage is present", absent.length === 0, absent.join(", "));

/* ── code nodes compile ──────────────────────────────────────────────────── */

for (const node of workflow.nodes.filter((n) => n.type === "n8n-nodes-base.code")) {
  let ok = true;
  let detail;
  try {
    // n8n runs a Code node's body inside an async function; wrap it the same
    // way so a top-level `return` is legal.
    new Script(`(async function(){\n${node.parameters.jsCode}\n})`, {
      filename: node.name,
    });
  } catch (error) {
    ok = false;
    detail = String(error);
  }
  check(`Code node parses: ${node.name}`, ok, detail);
}

/* ── graph integrity ─────────────────────────────────────────────────────── */

let dangling = null;
for (const [from, conn] of Object.entries(workflow.connections)) {
  if (!names.has(from)) dangling ??= `source "${from}"`;
  for (const branch of conn.main ?? []) {
    for (const target of branch) {
      if (!names.has(target.node)) dangling ??= `"${from}" → "${target.node}"`;
    }
  }
}
check("every connection resolves to a real node", dangling === null, dangling ?? undefined);

const reachable = new Set(["Webhook"]);
let grew = true;
while (grew) {
  grew = false;
  for (const [from, conn] of Object.entries(workflow.connections)) {
    if (!reachable.has(from)) continue;
    for (const branch of conn.main ?? []) {
      for (const target of branch) {
        if (!reachable.has(target.node)) {
          reachable.add(target.node);
          grew = true;
        }
      }
    }
  }
}
const orphans = workflow.nodes
  .filter((n) => n.type !== "n8n-nodes-base.stickyNote" && !reachable.has(n.name))
  .map((n) => n.name);
check("every node is reachable from the webhook", orphans.length === 0, orphans.join(", "));

// Each IF must wire both outputs, or a rejected request hangs with no response.
const ifNodes = workflow.nodes.filter((n) => n.type === "n8n-nodes-base.if");
const unwired = ifNodes.filter((n) => {
  const branches = workflow.connections[n.name]?.main ?? [];
  return branches.length < 2 || branches.some((b) => b.length === 0);
});
check(
  "every gate wires both its true and false output",
  unwired.length === 0,
  unwired.map((n) => n.name).join(", "),
);

/* ── contract drift — the reason this file exists ────────────────────────── */

const builder = byName.get("Build Gemini request");
check(
  "embedded system prompt matches the shared contract",
  Boolean(builder) && builder.parameters.jsCode.includes(JSON.stringify(SYSTEM_PROMPT)),
  "run `npm run build:workflow` to regenerate",
);
check(
  "embedded output schema matches the shared contract",
  Boolean(builder) &&
    builder.parameters.jsCode.includes(JSON.stringify(OUTPUT_JSON_SCHEMA)),
  "run `npm run build:workflow` to regenerate",
);

// The evidence matcher is inlined source, so compare it function by function
// against the file the app imports.
const verifier = byName.get("Verify evidence");
const sharedSource = readFileSync(
  join(root, "src", "contract", "evidence-check.mjs"),
  "utf8",
);
const sharedBodies = [...sharedSource.matchAll(/^export function (\w+)\(([\s\S]*?)^}/gm)];
check(
  "shared evidence checker was inlined",
  sharedBodies.length > 0 && Boolean(verifier),
  "no exported functions found in evidence-check.mjs",
);
if (verifier && sharedBodies.length > 0) {
  const drifted = sharedBodies
    .filter(([full]) => !verifier.parameters.jsCode.includes(full.replace(/^export /, "")))
    .map((m) => m[1]);
  check(
    "inlined evidence matcher matches the shared contract",
    drifted.length === 0,
    drifted.length > 0
      ? `drifted: ${drifted.join(", ")} — run \`npm run build:workflow\``
      : undefined,
  );
}

/* ── behavioural spot-check on the inlined matcher ───────────────────────── */

// Run the inlined code in a sandbox and assert it still distinguishes a real
// quote from a fabricated one. A matcher that says "verified" for everything
// would pass every structural check above and be worthless.
if (verifier) {
  let behaviourOk = false;
  let detail;
  try {
    const probe = `
      ${verifier.parameters.jsCode.split("const input = $input.first().json;")[0]}
      const idx = indexTranscript([
        { index: 0, text: "This is the third time I've called about this." },
        { index: 1, text: "I understand, and I'm sorry about that." },
      ]);
      globalThis.__result = {
        exact:   verifyQuote("third time I've called", 0, idx).kind,
        moved:   verifyQuote("I'm sorry about that", 0, idx).kind,
        missing: verifyQuote("we will issue a full refund today", 0, idx).kind,
        short:   verifyQuote("the", 0, idx).kind,
      };
    `;
    const script = new Script(probe, { filename: "evidence-probe" });
    const sandbox = { globalThis: {} };
    sandbox.globalThis = sandbox;
    script.runInNewContext(sandbox, { timeout: 3000 });
    const r = sandbox.__result;
    behaviourOk =
      r.exact === "exact" &&
      r.moved === "moved" &&
      r.missing === "missing" &&
      r.short === "empty";
    detail = behaviourOk ? undefined : JSON.stringify(r);
  } catch (error) {
    detail = String(error);
  }
  check(
    "inlined matcher separates real quotes from fabricated ones",
    behaviourOk,
    detail,
  );
}

const gemini = byName.get("Gemini — analyse call");
check(
  "Gemini HTTP node uses the generateContent URL from the previous stage",
  Boolean(gemini) && String(gemini.parameters.url ?? "").includes("geminiUrl"),
);
check(
  "Gemini credential is Header Auth named Gemini API",
  gemini?.credentials?.httpHeaderAuth?.name === "Gemini API",
);

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll checks passed.");
