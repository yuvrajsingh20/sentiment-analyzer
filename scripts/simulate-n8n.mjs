/**
 * Run the generated n8n workflow locally, without n8n.
 *
 *   node scripts/simulate-n8n.mjs [port]        # default 5678
 *
 * Loads n8n/sentiment-analyzer.workflow.json, walks its connection graph, and
 * executes each Code node's real source in a sandbox with a minimal n8n shim
 * ($input, $env, $('Node')). Only the Claude HTTP node is substituted, with a
 * canned Messages API response synthesised from the transcript that was posted.
 *
 * Why this exists: the workflow's Code nodes contain the authentication check,
 * the input validation, the conversation parser, the evidence verifier and the
 * quality gate. Those are real logic, and "it imports into n8n without a red
 * triangle" is not evidence that they work. This runs them.
 *
 * Point the app at it to exercise the full UI → n8n → gate → dashboard path
 * with no n8n instance and no API key:
 *
 *   node scripts/simulate-n8n.mjs &
 *   N8N_WEBHOOK_URL=http://localhost:5678/webhook/sentiment-analyze \
 *   N8N_WEBHOOK_SECRET=local-dev npm run start
 *
 * It is a test double. It never calls a model, and the analysis it returns is
 * synthetic — useful for exercising plumbing, useless as an analysis.
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const workflow = JSON.parse(
  readFileSync(join(here, "..", "n8n", "sentiment-analyzer.workflow.json"), "utf8"),
);

const nodesByName = new Map(workflow.nodes.map((n) => [n.name, n]));
const PORT = Number(process.argv[2]) || 5678;

/* ── the n8n shim ────────────────────────────────────────────────────────── */

async function runCodeNode(node, items, outputs) {
  const sandbox = {
    $input: {
      first: () => items[0],
      all: () => items,
      last: () => items[items.length - 1],
    },
    $env: process.env,
    $: (name) => ({
      first: () => (outputs.get(name) ?? [{ json: {} }])[0],
      all: () => outputs.get(name) ?? [],
    }),
    $json: items[0]?.json,
    console,
    JSON,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    RegExp,
    Error,
    isNaN,
    parseInt,
    parseFloat,
  };

  // n8n executes a Code node's body inside an async function, so the wrapper
  // returns a promise — await it, or every stage sees an unresolved Promise
  // where its input items should be.
  const wrapped = `(async function(){\n${node.parameters.jsCode}\n})()`;
  return await runInNewContext(wrapped, sandbox, { timeout: 15_000, filename: node.name });
}

/** IF nodes in this workflow all test `$json.ok === true`. */
function evaluateGate(items) {
  return items[0]?.json?.ok === true;
}

/* ── the stubbed model call ──────────────────────────────────────────────── */

/**
 * A Messages API response built from the turns the workflow just parsed.
 *
 * Quotes are sliced out of real turns, so the workflow's own evidence verifier
 * must score this at 100% grounding — which is exactly what makes running it
 * worthwhile. One deliberately fabricated quote is included so the gate has
 * something to catch, and the run proves it catches it.
 */
function stubClaudeResponse(claudeRequest, context) {
  const turns = context.turns;
  const at = (i) => turns[Math.min(i, turns.length - 1)];
  const quote = (i) => ({
    turnIndex: at(i).index,
    quote: at(i).text.split(/\s+/).slice(0, 7).join(" "),
  });

  const claim = (value, i) => ({
    value,
    status: "ok",
    confidence: 0.78,
    reason: "simulated claim, evidence sliced from the transcript",
    evidence: [quote(i)],
  });
  const abstain = {
    value: null,
    status: "insufficient_evidence",
    confidence: 0.2,
    reason: "simulated abstention",
    evidence: [],
  };

  const analysis = {
    overall: {
      sentiment: "negative",
      score: -0.4,
      confidence: 0.8,
      reasoning: "Simulated verdict from scripts/simulate-n8n.mjs.",
      supportingSignals: ["simulated signal"],
      contradictingSignals: [],
      evidence: [quote(1)],
    },
    summary: {
      headline: "Simulated analysis — not a real model result.",
      abstract: "Produced by the local n8n simulator.",
      callReason: "simulated",
      outcome: "simulated",
    },
    utterances: turns.map((t, i) => ({
      index: t.index,
      sentiment: i % 3 === 1 ? "negative" : i % 3 === 0 ? "neutral" : "positive",
      score: i % 3 === 1 ? -0.5 : i % 3 === 0 ? 0 : 0.4,
      confidence: 0.75,
      emotion: "neutral",
      reasoning: "simulated",
    })),
    emotions: [
      {
        label: "frustration",
        intensity: 0.6,
        speakerRole: "customer",
        evidence: [quote(1)],
      },
    ],
    kpis: {
      customer: {
        sentiment: claim("negative", 1),
        frustration: claim(0.7, 1),
        effort: claim(0.6, 1),
        satisfaction: claim(0.3, 2),
        csatPredicted: claim(2.5, 2),
        npsCategory: claim("detractor", 2),
        escalationIntent: claim(0.4, 3),
        // Deliberately ungrounded, so the gate has a fabrication to catch.
        churnRisk: {
          value: 0.5,
          status: "ok",
          confidence: 0.6,
          reason: "simulated fabrication, to prove the gate catches it",
          evidence: [
            { turnIndex: 0, quote: "this sentence was never spoken on the call" },
          ],
        },
      },
      agent: {
        sentiment: claim("neutral", 0),
        empathy: claim(0.6, 0),
        professionalism: claim(0.8, 0),
        responsiveness: claim(0.7, 2),
        activeListening: claim(0.6, 2),
        ownership: claim(0.6, 2),
        resolutionEffectiveness: claim(0.5, 4),
      },
      conversation: {
        resolutionStatus: abstain,
        firstContactResolution: abstain,
        escalationRisk: claim(0.5, 3),
        urgency: claim("high", 3),
        issueCategory: claim("simulated", 1),
        topics: ["simulated topic"],
        complianceChecks: [
          { label: "Greeting", status: "passed", evidence: [quote(0)], note: "" },
        ],
      },
    },
    keyMoments: [
      {
        utteranceIndex: at(1).index,
        type: "turning_point",
        label: "Simulated moment",
        quote: quote(1).quote,
        why: "simulated",
      },
    ],
    actionItems: [],
    coaching: [
      {
        area: "simulated",
        observation: "simulated",
        recommendation: "simulated",
        evidence: [quote(0)],
      },
    ],
    risks: [],
    limitations: ["This analysis is synthetic — produced without a model call."],
  };

  return {
    id: "msg_simulated",
    type: "message",
    role: "assistant",
    model: claudeRequest.model,
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify(analysis) }],
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

/* ── graph walk ──────────────────────────────────────────────────────────── */

function nextNodes(name, branch) {
  const conn = workflow.connections[name];
  if (!conn?.main) return [];
  return (conn.main[branch] ?? []).map((t) => t.node);
}

async function execute(body, headers, log) {
  const outputs = new Map();
  let current = nextNodes("Webhook", 0)[0];
  let items = [{ json: { body, headers } }];

  while (current) {
    const node = nodesByName.get(current);
    if (!node) throw new Error(`Unknown node: ${current}`);

    if (node.type === "n8n-nodes-base.code") {
      items = await runCodeNode(node, items, outputs);
      outputs.set(node.name, items);
      log.push(`  ${node.name} → ok=${items[0]?.json?.ok}`);
      current = nextNodes(node.name, 0)[0];
      continue;
    }

    if (node.type === "n8n-nodes-base.if") {
      const passed = evaluateGate(items);
      log.push(`  ${node.name} → ${passed ? "true" : "FALSE (error branch)"}`);
      current = nextNodes(node.name, passed ? 0 : 1)[0];
      continue;
    }

    if (node.type === "n8n-nodes-base.httpRequest") {
      const request = items[0].json.claudeRequest;
      const context = items[0].json.context;
      items = [{ json: stubClaudeResponse(request, context) }];
      outputs.set(node.name, items);
      log.push(`  ${node.name} → STUBBED (no model call)`);
      current = nextNodes(node.name, 0)[0];
      continue;
    }

    if (node.type === "n8n-nodes-base.respondToWebhook") {
      const payload = items[0].json;
      const status = node.name === "Respond 200" ? 200 : payload.status || 502;
      log.push(`  ${node.name} → HTTP ${status}`);
      return { status, payload };
    }

    throw new Error(`Unhandled node type: ${node.type} (${node.name})`);
  }

  throw new Error("Workflow ended without reaching a Respond node.");
}

/* ── server ──────────────────────────────────────────────────────────────── */

const server = createServer((req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405).end("POST only");
    return;
  }

  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    const log = [`\n▸ ${req.method} ${req.url}`];
    let out;
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      out = await execute(body, req.headers, log);
    } catch (error) {
      log.push(`  ✗ ${error}`);
      out = { status: 500, payload: { error: String(error) } };
    }
    console.log(log.join("\n"));
    res.writeHead(out.status, { "content-type": "application/json" });
    res.end(JSON.stringify(out.payload));
  });
});

server.listen(PORT, () => {
  console.log(
    [
      `n8n workflow simulator listening on http://localhost:${PORT}/webhook/sentiment-analyze`,
      `  running ${workflow.nodes.filter((n) => n.type === "n8n-nodes-base.code").length} real Code stages from the generated workflow`,
      `  the Claude HTTP call is stubbed — this returns a SYNTHETIC analysis`,
      "",
    ].join("\n"),
  );
});
