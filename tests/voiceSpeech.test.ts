import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  detectReadAloudTopic,
  detectVoiceIntent,
} from "../src/services/voice/intent.ts";
import {
  buildBudgetScript,
  buildGoalsScript,
  buildInsightsScript,
  buildSpendingSummaryScript,
  speechAmount,
  toSpeechText,
} from "../src/services/voice/readAloud.ts";
import {
  createInMemoryVoiceSpeaker,
  getVoiceSpeaker,
  registerVoiceSpeaker,
  resetVoiceSpeaker,
  toSpeechError,
  unavailableVoiceSpeaker,
} from "../src/services/voice/speech.ts";
import {
  voiceCancelled,
  voiceNothingToRead,
  voiceReadAloudUnavailable,
  voiceSaveFailed,
  voiceSavedConfirmation,
  voiceSpokenSaveConfirmation,
} from "../src/services/voice/responses.ts";
import type {
  BudgetWithCategory,
  Insight,
  SavingsGoalWithBalance,
} from "../src/types/database.ts";
import type { VoiceSpeakerEvent } from "../src/services/voice/types.ts";

function budget(
  name: string,
  limit: number,
  spent: number
): BudgetWithCategory {
  return {
    id: 1,
    category_id: 1,
    limit_amount: limit,
    created_at: "2026-01-01 00:00:00",
    updated_at: "2026-01-01 00:00:00",
    category_name: name,
    category_icon: "📦",
    category_color: "#006B5B",
    spent,
  };
}

function goal(
  name: string,
  overrides: Partial<SavingsGoalWithBalance> = {}
): SavingsGoalWithBalance {
  return {
    id: 1,
    name,
    target_amount: 20_000_000,
    current_amount: 0,
    target_date: null,
    note: "",
    created_at: "2026-01-01 00:00:00",
    updated_at: "2026-01-01 00:00:00",
    balance: 0,
    remaining: 20_000_000,
    percent_complete: 0,
    is_reached: false,
    contribution_count: 0,
    ...overrides,
  };
}

function insight(message: string): Insight {
  return { id: "x", tone: "neutral", icon: "wallet-outline", message };
}

describe("read-only voice intent", () => {
  it("classifies questions and read-aloud requests as insights", () => {
    assert.equal(detectVoiceIntent("How much did I spend this month?"), "insight");
    assert.equal(detectVoiceIntent("Read my spending insights"), "insight");
    assert.equal(detectVoiceIntent("What's my food budget?"), "insight");
    assert.equal(detectVoiceIntent("Show me my savings progress"), "insight");
    assert.equal(detectVoiceIntent("Tell me about my budget"), "insight");
  });

  it("still classifies edits and entries as before", () => {
    assert.equal(
      detectVoiceIntent("Set my monthly food budget to ₦40,000."),
      "budget"
    );
    assert.equal(
      detectVoiceIntent("Create a savings goal of ₦200,000 for a laptop."),
      "goal"
    );
    assert.equal(detectVoiceIntent("Change my food budget to 50k"), "budget");
    assert.equal(detectVoiceIntent("I spent ₦3,000 on food today"), "transaction");
  });

  it("picks the topic a read-only question is about", () => {
    assert.equal(detectReadAloudTopic("How much did I spend this month?"), "spending");
    assert.equal(detectReadAloudTopic("Read my spending insights"), "spending");
    assert.equal(detectReadAloudTopic("Show me my budgets"), "budgets");
    assert.equal(detectReadAloudTopic("Tell me my savings progress"), "goals");
    assert.equal(detectReadAloudTopic("Read my insights"), "insights");
    assert.equal(detectReadAloudTopic("What's going on"), "insights");
  });
});

describe("read-aloud wording", () => {
  it("speaks amounts in naira without the currency symbol", () => {
    assert.equal(speechAmount(400_000), "4,000 naira");
    assert.equal(
      toSpeechText("You recorded ₦4,000 in income this month."),
      "You recorded 4,000 in income this month."
    );
  });
});

describe("insight scripts", () => {
  it("reads the deterministic insights back gently", () => {
    const script = buildInsightsScript([
      insight("You recorded ₦4,000 income and ₦1,000 expenses this month."),
    ]);
    assert.equal(script.empty, false);
    assert.match(script.text, /Here's what I noticed/);
    assert.match(script.text, /4,000/);
    assert.doesNotMatch(script.text, /₦/);
    assert.match(script.text, /only on what you've entered/);
  });

  it("invites the user to record something when there is nothing yet", () => {
    const script = buildInsightsScript([]);
    assert.equal(script.empty, true);
    assert.equal(script.text, voiceNothingToRead());
  });
});

describe("spending summary script", () => {
  it("reports income, spending and a gentle net", () => {
    const script = buildSpendingSummaryScript({
      label: "this month",
      totalIncomeKobo: 500_000,
      totalExpensesKobo: 200_000,
    });
    assert.equal(script.empty, false);
    assert.match(script.text, /5,000 naira/);
    assert.match(script.text, /2,000 naira/);
    assert.match(script.text, /about 3,000 naira/);
  });

  it("keeps a spending-over-income month free of judgement", () => {
    const script = buildSpendingSummaryScript({
      label: "this month",
      totalIncomeKobo: 100_000,
      totalExpensesKobo: 300_000,
    });
    assert.match(script.text, /more than your recorded income/);
    assert.match(script.text, /no judgement/);
  });

  it("handles income-only, expense-only and empty data", () => {
    assert.match(
      buildSpendingSummaryScript({
        label: "this month",
        totalIncomeKobo: 100_000,
        totalExpensesKobo: 0,
      }).text,
      /no spending recorded yet/
    );
    assert.match(
      buildSpendingSummaryScript({
        label: "this month",
        totalIncomeKobo: 0,
        totalExpensesKobo: 100_000,
      }).text,
      /no income recorded yet/
    );
    assert.equal(
      buildSpendingSummaryScript({
        label: "this month",
        totalIncomeKobo: 0,
        totalExpensesKobo: 0,
      }).empty,
      true
    );
  });
});

describe("budget script", () => {
  it("describes each budget's status without pressure", () => {
    const over = buildBudgetScript([budget("Food", 100_000, 150_000)]);
    assert.match(over.text, /Food is a little over its monthly limit/);
    assert.match(over.text, /150%/);
    assert.doesNotMatch(over.text, /₦/);

    const near = buildBudgetScript([budget("Transport", 100_000, 85_000)]);
    assert.match(near.text, /close to its limit at 85%/);
    assert.match(near.text, /150 naira left to spend/);

    const normal = buildBudgetScript([budget("Data", 100_000, 20_000)]);
    assert.match(normal.text, /comfortably on track, at 20%/);
  });

  it("offers to add a budget when there are none", () => {
    const script = buildBudgetScript([]);
    assert.equal(script.empty, true);
    assert.match(script.text, /haven't set up any budgets/);
  });
});

describe("goals script", () => {
  it("celebrates reached goals and describes progress gently", () => {
    const script = buildGoalsScript([
      goal("Laptop", {
        target_amount: 200_000,
        balance: 200_000,
        remaining: 0,
        percent_complete: 100,
        is_reached: true,
      }),
      goal("Vacation", {
        target_amount: 1_000_000,
        balance: 500_000,
        remaining: 500_000,
        percent_complete: 50,
      }),
    ]);
    assert.match(script.text, /reached your Laptop goal/);
    assert.match(script.text, /2,000 naira set aside/);
    assert.match(script.text, /Vacation is 50% of the way there/);
    assert.match(script.text, /5,000 naira saved/);
    assert.match(script.text, /Progress at any pace is still progress/);
  });

  it("offers to start when no goals exist", () => {
    const script = buildGoalsScript([]);
    assert.equal(script.empty, true);
    assert.match(script.text, /haven't started any savings goals/);
  });
});

describe("spoken confirmations", () => {
  it("never blurts out figures or amounts", () => {
    const statuses = [
      "saved",
      "duplicate",
      "incomplete",
      "unknown_goal",
      "duplicate_goal",
    ] as const;
    for (const status of statuses) {
      const message = voiceSpokenSaveConfirmation(status);
      assert.ok(message.length > 0);
      assert.doesNotMatch(message, /[0-9₦]/);
    }
    assert.equal(
      voiceSpokenSaveConfirmation("saved"),
      voiceSavedConfirmation()
    );
  });

  it("keeps the surrounding copy calm", () => {
    for (const message of [
      voiceCancelled(),
      voiceSaveFailed(),
      voiceReadAloudUnavailable(),
    ]) {
      assert.ok(message.length > 0);
      assert.doesNotMatch(message, /[0-9₦]/);
    }
  });
});

describe("speaker registry", () => {
  afterEach(() => resetVoiceSpeaker());

  it("defaults to a speaker that reports itself unavailable", async () => {
    assert.equal(getVoiceSpeaker(), unavailableVoiceSpeaker);
    assert.equal(await unavailableVoiceSpeaker.isAvailable(), false);
    await assert.rejects(
      unavailableVoiceSpeaker.speak("hello"),
      (error: unknown) => (error as { kind: string }).kind === "unavailable"
    );
  });

  it("installs and resets a registered speaker", () => {
    const speaker = createInMemoryVoiceSpeaker();
    registerVoiceSpeaker(speaker);
    assert.equal(getVoiceSpeaker(), speaker);
    resetVoiceSpeaker();
    assert.equal(getVoiceSpeaker(), unavailableVoiceSpeaker);
  });

  it("normalises unknown speech errors", () => {
    assert.deepEqual(toSpeechError(new Error("boom")), {
      kind: "failed",
      message: "I couldn't read that out just now. The words are on screen.",
    });
  });
});

describe("in-memory speaker", () => {
  it("announces start, then done, and records the utterance", async () => {
    const speaker = createInMemoryVoiceSpeaker();
    assert.equal(await speaker.isAvailable(), true);

    const events: VoiceSpeakerEvent[] = [];
    speaker.subscribe((event) => events.push(event));

    const pending = speaker.speak("Here is your summary.");
    assert.equal(speaker.isSpeaking(), true);
    assert.deepEqual(speaker.spoken, ["Here is your summary."]);

    speaker.finish();
    await pending;

    assert.equal(speaker.isSpeaking(), false);
    assert.deepEqual(
      events.map((event) => event.type),
      ["start", "done"]
    );
    assert.deepEqual(events[1], {
      type: "done",
      text: "Here is your summary.",
      interrupted: false,
    });
  });

  it("stops the current utterance on request", async () => {
    const speaker = createInMemoryVoiceSpeaker();
    const events: VoiceSpeakerEvent[] = [];
    speaker.subscribe((event) => events.push(event));

    const pending = speaker.speak("Read this");
    await speaker.stop();
    await pending;

    assert.equal(speaker.isSpeaking(), false);
    assert.deepEqual(
      events.map((event) => event.type),
      ["start", "stopped"]
    );
  });

  it("interrupts the previous utterance when a new one starts", async () => {
    const speaker = createInMemoryVoiceSpeaker();
    const events: VoiceSpeakerEvent[] = [];
    speaker.subscribe((event) => events.push(event));

    const first = speaker.speak("One");
    const second = speaker.speak("Two");
    assert.deepEqual(
      events.map((event) => event.type),
      ["start", "done", "start"]
    );
    const firstDone = events[1];
    assert.equal(firstDone.type === "done" && firstDone.interrupted, true);

    speaker.finish();
    await second;
    await first;
    assert.deepEqual(speaker.spoken, ["One", "Two"]);
  });

  it("ignores empty utterances", async () => {
    const speaker = createInMemoryVoiceSpeaker();
    await speaker.speak("   ");
    assert.deepEqual(speaker.spoken, []);
    assert.equal(speaker.isSpeaking(), false);
  });
});
