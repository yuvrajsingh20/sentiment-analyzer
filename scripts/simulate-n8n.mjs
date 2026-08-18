/**
 * Run the generated n8n workflow locally, without n8n.
 *
 *   node scripts/simulate-n8n.mjs [port]        # default 5678
 *
 * Loads n8n/sentiment-analyzer.workflow.json, walks its connection graph, and
 * executes each Code node's real source in a sandbox with a minimal n8n shim
 * ($input, $env, $('Node')).
 *
 * The Gemini HTTP node:
 *   - calls generateContent for real when GEMINI_API_KEY is set (this is the
 *     local stand-in for n8n Header Auth — Next.js still never sees the key)
 *   - otherwise returns a canned analysis so the plumbing can be exercised
 *     without an API key
 *
 *   node scripts/simulate-n8n.mjs &
 *   N8N_WEBHOOK_URL=http://localhost:5678/webhook/sentiment-analyze npm run dev
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function loadEnvFile(filePath, { override = false } = {}) {
  let text;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (override || process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(join(root, ".env"));
loadEnvFile(join(root, ".env.local"), { override: true });

const workflow = JSON.parse(
  readFileSync(join(root, "n8n", "sentiment-analyzer.workflow.json"), "utf8"),
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
    $vars: {
      N8N_WEBHOOK_SECRET: process.env.N8N_WEBHOOK_SECRET,
      GEMINI_MODEL: process.env.GEMINI_MODEL,
    },
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function geminiBusy(status, json) {
  const msg = String(json?.error?.message ?? "");
  return (
    status === 503 ||
    status === 429 ||
    /high demand|UNAVAILABLE|overloaded|RESOURCE_EXHAUSTED/i.test(msg)
  );
}

function urlWithModel(url, model) {
  return String(url).replace(/models\/[^/:]+/, `models/${model}`);
}

async function callGeminiOnce(url, request, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(request),
    });
    const raw = await response.text();
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      json = { error: { message: raw.slice(0, 600), code: response.status } };
    }
    return { status: response.status, json };
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(url, request, apiKey) {
  const preferred = (String(url).match(/models\/([^/:]+)/) ?? [])[1] || "gemini-2.5-flash";
  const models = [...new Set([preferred, "gemini-2.5-flash", "gemini-2.0-flash"])];
  let last = {
    status: 502,
    json: { error: { message: "Gemini did not respond.", code: 502 } },
  };

  for (const model of models) {
    const modelUrl = urlWithModel(url, model);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      last = await callGeminiOnce(modelUrl, request, apiKey);
      if (last.status >= 200 && last.status < 300 && !last.json?.error) {
        if (model !== preferred) {
          last.json.modelVersion = last.json.modelVersion || model;
        }
        return last;
      }
      if (!geminiBusy(last.status, last.json)) return last;
      if (attempt < 3) await sleep(1200 * attempt);
    }
  }

  return last;
}

/** IF nodes in this workflow all test `$json.ok === true`. */
function evaluateGate(items) {
  return items[0]?.json?.ok === true;
}

/* ── the stubbed model call ──────────────────────────────────────────────── */

/**
 * A Gemini generateContent response built from the turns the workflow just parsed.
 *
 * Quotes are sliced out of real turns, so the workflow's own evidence verifier
 * must score this at 100% grounding — which is exactly what makes running it
 * worthwhile. One deliberately fabricated quote is included so the gate has
 * something to catch, and the run proves it catches it.
 */
function stubGeminiResponse(geminiRequest, context) {
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
      company: {
        brandSentiment: claim("negative", 1),
        slaAdherence: claim(0.3, 1),
        processEffectiveness: claim(0.4, 1),
        policyClarity: claim(0.5, 2),
        knowledgeAccuracy: claim(0.6, 0),
        reputationalRisk: claim(0.5, 3),
        revenueAtRisk: claim(0.4, 3),
        repeatContactRisk: claim(0.7, 1),
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
    candidates: [
      {
        content: { role: "model", parts: [{ text: JSON.stringify(analysis) }] },
        finishReason: "STOP",
      },
    ],
    modelVersion: context.model || "gemini-2.5-flash",
    usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 },
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
      const request = items[0].json.geminiRequest;
      const url = items[0].json.geminiUrl;
      const context = {
        ...items[0].json.context,
        model: items[0].json.model,
      };
      if (!request) throw new Error("Gemini HTTP node expected $json.geminiRequest");

      const apiKey = process.env.GEMINI_API_KEY?.trim();
      if (apiKey) {
        if (!url) throw new Error("Gemini HTTP node expected $json.geminiUrl");
        const result = await callGemini(url, request, apiKey);
        items = [{ json: result.json }];
        outputs.set(node.name, items);
        log.push(`  ${node.name} → Gemini HTTP ${result.status}`);
      } else {
        items = [{ json: stubGeminiResponse(request, context) }];
        outputs.set(node.name, items);
        log.push(`  ${node.name} → STUBBED (no GEMINI_API_KEY)`);
      }
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
  const live = Boolean(process.env.GEMINI_API_KEY?.trim());
  console.log(
    [
      `n8n workflow simulator listening on http://localhost:${PORT}/webhook/sentiment-analyze`,
      `  running ${workflow.nodes.filter((n) => n.type === "n8n-nodes-base.code").length} real Code stages from the generated workflow`,
      live
        ? `  Gemini: LIVE (${process.env.GEMINI_MODEL || "default model"})`
        : `  Gemini: STUBBED — set GEMINI_API_KEY in .env.local for a real analysis`,
      "",
    ].join("\n"),
  );
});
