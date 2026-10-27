import assert from "node:assert/strict";
import test from "node:test";
import type { GamePeriod, TeamRubber } from "../shared/types.ts";
import { inferMatchStatus, resolveRubberScore } from "./ittfClient.ts";

function period(homeScore: number, awayScore: number, finished = false): GamePeriod {
  return {
    gameNumber: 1,
    homeScore,
    awayScore,
    finished,
    winner: finished ? (homeScore > awayScore ? "home" : "away") : null
  };
}

function rubber(
  homeScore: number,
  awayScore: number,
  periods: GamePeriod[] = []
): TeamRubber {
  return {
    number: 1,
    homeName: "Home",
    homeCnName: "主队",
    awayName: "Away",
    awayCnName: "客队",
    homeScore,
    awayScore,
    periods,
    winner: homeScore >= 3 || awayScore >= 3 ? (homeScore > awayScore ? "home" : "away") : null,
    live: periods.some((game) => !game.finished)
  };
}

test("keeps a match without score data scheduled", () => {
  assert.equal(inferMatchStatus(4, true, [], [rubber(0, 0)], 0, 0, false), "SCHEDULED");
});

test("infers a live singles match from an unfinished game", () => {
  assert.equal(inferMatchStatus(4, false, [period(11, 8, true), period(4, 5)], [], 1, 0, false), "LIVE");
});

test("infers a live team match from a started rubber", () => {
  assert.equal(inferMatchStatus(4, true, [], [rubber(2, 1, [period(6, 8)])], 0, 0, false), "LIVE");
});

test("keeps the official live status before the first point", () => {
  assert.equal(inferMatchStatus(2, false, [], [], 0, 0, false), "LIVE");
});

test("infers a completed match from its winning score", () => {
  assert.equal(inferMatchStatus(4, false, [period(11, 8, true)], [], 3, 2, false), "OFFICIAL");
});

test("infers a completed team match from three winning rubbers", () => {
  assert.equal(
    inferMatchStatus(4, true, [], [rubber(3, 1)], 3, 1, false),
    "OFFICIAL"
  );
});

test("uses finished games when the rubber summary is one game behind", () => {
  assert.deepEqual(resolveRubberScore(0, 0, [period(11, 4, true)]), {
    homeScore: 1,
    awayScore: 0
  });
});

test("keeps a larger official rubber score when split data is incomplete", () => {
  assert.deepEqual(resolveRubberScore(3, 1, [period(11, 4, true)]), {
    homeScore: 3,
    awayScore: 1
  });
});

