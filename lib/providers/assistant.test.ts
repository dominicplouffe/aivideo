import assert from "node:assert/strict";
import test from "node:test";
import { AnthropicAssistant, offlineAssistant, type AssistantRequest } from "./assistant";

function request(overrides: Partial<AssistantRequest> = {}): AssistantRequest {
  return {
    projectTitle: "Shipments walkthrough",
    durationSec: 92,
    sourceDurationSec: 240,
    removeFillers: true,
    chapters: [
      { ordinal: 0, title: "Open the board", durationSec: 30, text: "Open the shipments board.", deleted: false },
      { ordinal: 1, title: "Configuration", durationSec: 40, text: "Set the carrier rules.", deleted: false },
      { ordinal: 2, title: "The result", durationSec: 22, text: "And the rate appears.", deleted: false },
    ],
    history: [],
    message: "Get this under a minute.",
    ...overrides,
  };
}

/** A stubbed `messages.create` that returns one JSON payload. */
function stub(payload: unknown, stopReason: string = "end_turn") {
  return async () =>
    ({
      content: [{ type: "text", text: JSON.stringify(payload) }],
      stop_reason: stopReason,
    }) as never;
}

test("a proposal comes back as data, never as an applied edit", async () => {
  const assistant = new AnthropicAssistant({
    apiKey: "k",
    messagesCreate: stub({
      text: "Dropping chapter 1 would bring this to about 52 seconds. You would lose the carrier rules.",
      proposal_summary: "Drop “Configuration”",
      proposal: { deleted_segments: [1] },
    }),
  });

  const reply = await assistant.respond(request());
  assert.deepEqual(reply.proposal, { deletedSegments: [1] });
  assert.equal(reply.proposalSummary, "Drop “Configuration”");
  // The reply is prose for a person to read; nothing here mutates anything.
  assert.match(reply.text, /would bring this/);
});

test("a chapter that does not exist is dropped from the proposal", async () => {
  // A hallucinated ordinal would otherwise sit in the saved edit state
  // forever, deleting whatever chapter appears at that index later.
  const assistant = new AnthropicAssistant({
    apiKey: "k",
    messagesCreate: stub({ text: "ok", proposal: { deleted_segments: [1, 7, -2, 99] } }),
  });
  const reply = await assistant.respond(request());
  assert.deepEqual(reply.proposal, { deletedSegments: [1] });
});

test("duplicate ordinals collapse and sort", async () => {
  const assistant = new AnthropicAssistant({
    apiKey: "k",
    messagesCreate: stub({ text: "ok", proposal: { deleted_segments: [2, 0, 2] } }),
  });
  assert.deepEqual((await assistant.respond(request())).proposal, { deletedSegments: [0, 2] });
});

test("a question comes back with no proposal at all", async () => {
  const assistant = new AnthropicAssistant({
    apiKey: "k",
    messagesCreate: stub({ text: "The longest chapter is Configuration, at 40 seconds." }),
  });
  const reply = await assistant.respond(request({ message: "Which chapter is longest?" }));
  assert.equal(reply.proposal, undefined);
  assert.equal(reply.proposalSummary, undefined);
});

test("an empty proposal object is not a proposal", async () => {
  const assistant = new AnthropicAssistant({
    apiKey: "k",
    messagesCreate: stub({ text: "ok", proposal: {} }),
  });
  assert.equal((await assistant.respond(request())).proposal, undefined);
});

test("a refusal and an unparseable reply both fail loudly", async () => {
  const refusing = new AnthropicAssistant({ apiKey: "k", messagesCreate: stub({}, "refusal") });
  await assert.rejects(() => refusing.respond(request()), /declined/);

  const garbled = new AnthropicAssistant({
    apiKey: "k",
    messagesCreate: async () =>
      ({ content: [{ type: "text", text: "Sure! Here you go:" }], stop_reason: "end_turn" }) as never,
  });
  await assert.rejects(() => garbled.respond(request()), /did not parse/);
});

test("the chapters and the current cut are in the prompt", async () => {
  let sent = "";
  const assistant = new AnthropicAssistant({
    apiKey: "k",
    messagesCreate: async (params) => {
      sent = String(params.messages.at(-1)?.content ?? "");
      return { content: [{ type: "text", text: '{"text":"ok"}' }], stop_reason: "end_turn" } as never;
    },
  });
  await assistant.respond(request({ chapters: [
    { ordinal: 0, title: "Open the board", durationSec: 30, text: "Open it.", deleted: false },
    { ordinal: 1, title: "Gone already", durationSec: 12, text: "Skip.", deleted: true },
  ] }));

  assert.match(sent, /Current cut: 92\.0s/);
  assert.match(sent, /\[0\] Open the board — 30\.0s/);
  // A dropped chapter is still described, because `deleted_segments`
  // replaces the whole set and the model has to know what is already out.
  assert.match(sent, /\[1\] Gone already — 12\.0s \(currently dropped\)/);
});

test("the offline assistant measures rather than converses", async () => {
  const reply = await offlineAssistant.respond(request());
  assert.match(reply.text, /92s from a 240s take/);
  assert.match(reply.text, /Configuration/);
  // It says why it cannot do more, instead of inventing an answer — which
  // is the entire difference from the canned-reply panel it replaced.
  assert.match(reply.text, /ANTHROPIC_API_KEY/);
  assert.equal(reply.proposal, undefined);
});
