// features/masterwork/drive/__tests__/voiceCommands.test.ts
//
// THE GUARD for "pause/resume by voice" — and, much more importantly, for the
// failure that would make this lane worse than useless: a false positive that
// cuts an Expert off in the middle of the one story she was going to tell.

import {
  matchDriveVoiceCommand,
  normaliseUtterance,
} from "../voiceCommands";

describe("commands a person actually says in a car", () => {
  it.each([
    ["pause", "pause"],
    ["Pause.", "pause"],
    ["Okay, pause the interview.", "pause"],
    ["hold on", "pause"],
    ["Give me a second", "pause"],
    ["stop recording please", "pause"],
    ["Hold that thought!", "pause"],
    ["one second", "pause"],
    ["okay I'm back", "resume"],
    ["Carry on.", "resume"],
    ["keep going", "resume"],
    ["Alright, continue.", "resume"],
    ["where were we", "resume"],
    ["I'm done", "end"],
    ["We're done.", "end"],
    ["End the interview", "end"],
    ["okay let's wrap up", "end"],
    ["I've arrived", "end"],
    ["that's it for now", "end"],
  ])("%p → %p", (utterance, expected) => {
    expect(matchDriveVoiceCommand(utterance)).toBe(expected);
  });
});

describe("a command never eats a sentence of real expertise", () => {
  it.each([
    "We paused the excavation for two days because the soil report came back wrong.",
    "You hold on to the retainer until the punch list is signed, never before.",
    "The thing I tell every new estimator is to stop, walk the site, and count the doors themselves.",
    "I'm done with contractors who quote from a photo — that's the whole rule.",
    "Continue the pour only if the slump test is inside spec, otherwise you send the truck back.",
    "Give me a second opinion before you sign anything over fifty thousand.",
    "Let me think about how I'd explain this to someone brand new on the crew.",
    "One second of hesitation on a ladder is how people get hurt, so we drill it.",
  ])("leaves %p alone", (utterance) => {
    expect(matchDriveVoiceCommand(utterance)).toBeNull();
  });

  it("refuses anything longer than the word ceiling, even if it contains a phrase", () => {
    expect(
      matchDriveVoiceCommand(
        "pause pause pause pause pause pause pause pause pause pause pause",
      ),
    ).toBeNull();
  });

  it("is off entirely when the knob says so", () => {
    expect(matchDriveVoiceCommand("pause", { enabled: false })).toBeNull();
  });

  it("ignores silence", () => {
    expect(matchDriveVoiceCommand("   ")).toBeNull();
    expect(matchDriveVoiceCommand("okay")).toBeNull();
  });
});

describe("end beats pause when both could match", () => {
  it("reads 'stop the interview' as ending, not as muting the mic", () => {
    expect(matchDriveVoiceCommand("stop the interview")).toBe("end");
  });
});

describe("normaliseUtterance", () => {
  it("strips punctuation, apostrophes and case", () => {
    expect(normaliseUtterance("Okay — I'm BACK!!")).toBe("okay im back");
  });
});
