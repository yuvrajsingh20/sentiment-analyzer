import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifySpeakers, parseTranscript, renderForModel } from "./transcript";

/**
 * Parser tests.
 *
 * Segmentation is the foundation the whole analysis sits on: the model's
 * `utterances[i].index` only means anything if turn boundaries are stable. An
 * off-by-one here silently mis-attributes every sentence-level label, so the
 * shapes real transcripts arrive in are pinned down here.
 */

describe("parseTranscript", () => {
  it("splits on `Speaker:` and preserves order", () => {
    const turns = parseTranscript(
      ["Agent: Good afternoon.", "Customer: I have a problem.", "Agent: Tell me."].join(
        "\n",
      ),
    );

    assert.equal(turns.length, 3);
    assert.deepEqual(
      turns.map((t) => t.speaker),
      ["Agent", "Customer", "Agent"],
    );
    assert.deepEqual(
      turns.map((t) => t.index),
      [0, 1, 2],
    );
    assert.equal(turns[1].text, "I have a problem.");
  });

  it("strips leading and inline timestamps", () => {
    const turns = parseTranscript(
      [
        "Agent (00:14): Good afternoon.",
        "00:22 Customer: Hello.",
        "[00:01:05] Agent: Anything else?",
      ].join("\n"),
    );

    assert.equal(turns.length, 3);
    assert.equal(turns[0].text, "Good afternoon.");
    assert.equal(turns[1].speaker, "Customer");
    assert.equal(turns[2].text, "Anything else?");
  });

  it("accepts bracketed and dash-separated speaker labels", () => {
    const turns = parseTranscript(
      ["[Customer] My order is late.", "Agent - I can check that."].join("\n"),
    );

    assert.equal(turns.length, 2);
    assert.equal(turns[0].speaker, "Customer");
    assert.equal(turns[1].speaker, "Agent");
  });

  it("merges consecutive lines from the same speaker into one turn", () => {
    const turns = parseTranscript(
      ["Agent: One.", "Agent: Two.", "Customer: Three."].join("\n"),
    );

    assert.equal(turns.length, 2);
    assert.equal(turns[0].text, "One. Two.");
  });

  it("treats an unlabelled line as a continuation of the previous turn", () => {
    const turns = parseTranscript(
      ["Customer: I called on Monday.", "and again on Tuesday.", "Agent: I see."].join(
        "\n",
      ),
    );

    assert.equal(turns.length, 2);
    assert.equal(turns[0].text, "I called on Monday. and again on Tuesday.");
  });

  it("does not mistake a sentence containing a colon for a speaker label", () => {
    const turns = parseTranscript(
      [
        "Agent: Here is what I found, and it matters: the refund never sent.",
        "Customer: Right.",
      ].join("\n"),
    );

    assert.equal(turns.length, 2);
    assert.equal(turns[0].speaker, "Agent");
    assert.match(turns[0].text, /the refund never sent/);
  });

  it("falls back to sentence segmentation for unstructured prose", () => {
    const turns = parseTranscript(
      "The customer was unhappy about the delay. The agent apologised twice. It ended well.",
    );

    assert.equal(turns.length, 3);
    assert.ok(turns.every((t) => t.inferredSpeaker));
    assert.match(turns[0].text, /^The customer was unhappy/);
  });

  it("counts words and ignores blank lines", () => {
    const turns = parseTranscript("Agent: one two three\n\n\nCustomer: four");

    assert.equal(turns.length, 2);
    assert.equal(turns[0].words, 3);
    assert.equal(turns[1].words, 1);
  });

  it("returns an empty array for empty input", () => {
    assert.deepEqual(parseTranscript(""), []);
    assert.deepEqual(parseTranscript("   \n\n  "), []);
  });
});

describe("classifySpeakers", () => {
  it("classifies by name hints", () => {
    const turns = parseTranscript(
      ["Support Agent: Hello.", "Caller: Hi.", "System: Call recorded."].join("\n"),
    );
    const roles = classifySpeakers(turns);

    assert.equal(roles.get("support agent"), "agent");
    assert.equal(roles.get("caller"), "customer");
    assert.equal(roles.get("system"), "other");
  });

  it("falls back to position when speakers are bare names", () => {
    const turns = parseTranscript(
      ["Priya: Good morning, how can I help?", "Tom: My table never arrived."].join("\n"),
    );
    const roles = classifySpeakers(turns);

    // First speaker greets → agent; the other party → customer.
    assert.equal(roles.get("priya"), "agent");
    assert.equal(roles.get("tom"), "customer");
  });

  it("matches hints on whole words, not substrings", () => {
    // Regression: "customer" contains "me", which is an agent hint. A naive
    // substring test classified every customer as the agent.
    const turns = parseTranscript("Agent: Hello.\nCustomer: Hi.");
    const roles = classifySpeakers(turns);

    assert.equal(roles.get("agent"), "agent");
    assert.equal(roles.get("customer"), "customer");
  });

  it("never leaves a speaker unclassified", () => {
    const turns = parseTranscript(
      ["Alice: One.", "Bob: Two.", "Carol: Three.", "Dave: Four."].join("\n"),
    );
    const roles = classifySpeakers(turns);

    for (const t of turns) {
      assert.ok(roles.has(t.speaker.toLowerCase()), `${t.speaker} unclassified`);
    }
  });
});

describe("renderForModel", () => {
  it("emits the indexed form the prompt and the n8n parser both expect", () => {
    const turns = parseTranscript("Agent: Hello.\nCustomer: Hi.");
    const rendered = renderForModel(turns);

    assert.equal(rendered, "[0] Agent: Hello.\n[1] Customer: Hi.");

    // The n8n "Normalise & parse conversation" stage re-parses exactly this.
    const reparsed = rendered
      .split("\n")
      .map((line) => /^\s*\[(\d+)\]\s*([^:]{1,64}?):\s*([\s\S]*)$/.exec(line))
      .filter((m): m is RegExpExecArray => m !== null);

    assert.equal(reparsed.length, turns.length);
    assert.equal(Number(reparsed[1][1]), 1);
    assert.equal(reparsed[1][2], "Customer");
    assert.equal(reparsed[1][3], "Hi.");
  });
});
