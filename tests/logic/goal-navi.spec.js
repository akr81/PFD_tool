const { test, expect } = require("@playwright/test");
const { loadApp, callApi } = require("../helpers/app");
const { goalNaviGraph } = require("../helpers/fixtures");

test.describe.configure({ mode: "serial" });

let page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await loadApp(page);
});

test.afterAll(async () => {
  if (page) await page.close();
});

test("Goal Navi normalizes duplicate phase ids", async () => {
  const normalized = await callApi(page, "normalizeGoalNavi", goalNaviGraph({
    phases: [
      { id: "phase", name: "A", plannedDays: 1 },
      { id: "phase", name: "B", plannedDays: 2 }
    ],
    records: []
  }));
  expect(normalized.phases.map(phase => phase.id)).toEqual(["phase", "phase-2"]);
});

test("Goal Navi creates a default record when records are empty", async () => {
  const normalized = await callApi(page, "normalizeGoalNavi", goalNaviGraph({ records: [] }));
  expect(normalized.records).toHaveLength(1);
  expect(normalized.records[0].phases["phase-1"]).toBeTruthy();
});

test("Goal Navi target ratio accepts percentages", async () => {
  const normalized = await callApi(page, "normalizeGoalNavi", goalNaviGraph({ targetRatio: 75 }));
  expect(normalized.targetRatio).toBe(0.75);
});

test("Goal Navi clamps too-small target ratio", async () => {
  const normalized = await callApi(page, "normalizeGoalNavi", goalNaviGraph({ targetRatio: 0.01 }));
  expect(normalized.targetRatio).toBe(0.05);
});

test("Goal Navi clamps too-large target ratio", async () => {
  const normalized = await callApi(page, "normalizeGoalNavi", goalNaviGraph({ targetRatio: 150 }));
  expect(normalized.targetRatio).toBe(0.95);
});

test("Goal Navi computes project summary values", async () => {
  const info = await callApi(page, "goalNaviInfo", goalNaviGraph());
  expect(info.totalWorkdays).toBe(20);
  expect(info.targetOffset).toBe(11);
  expect(info.bufferDays).toBe(9);
  expect(info.plannedDays).toBe(20);
});

test("Goal Navi computes row totals", async () => {
  const info = await callApi(page, "goalNaviInfo", goalNaviGraph());
  const row = info.rows[1];
  expect(row.totals.remainingPlanDays).toBe(16);
  expect(row.totals.totalEstimate).toBe(4);
  expect(row.totals.doneEstimate).toBe(2);
  expect(row.totals.remainingEstimate).toBe(2);
});

test("Goal Navi computes actual velocity between records", async () => {
  const info = await callApi(page, "goalNaviInfo", goalNaviGraph());
  expect(info.rows[1].workdaysSincePrevious).toBe(4);
  expect(info.rows[1].doneDelta).toBe(2);
  expect(info.rows[1].actualVelocity).toBeCloseTo(0.5, 8);
});

test("Goal Navi uses manual velocity override", async () => {
  const info = await callApi(page, "goalNaviInfo", goalNaviGraph());
  const row = info.rows[2];
  expect(row.velocitySource).toBe("manual");
  expect(row.effectiveVelocity).toBe(2);
});

test("Goal Navi computes progress rate", async () => {
  const info = await callApi(page, "goalNaviInfo", goalNaviGraph());
  expect(info.rows[2].progressRate).toBeCloseTo(6 / 20 * 100, 8);
});

test("Goal Navi latest row is last chronological record", async () => {
  const info = await callApi(page, "goalNaviInfo", goalNaviGraph());
  expect(info.latest.record.id).toBe("r3");
});

const evaluationCases = [
  ["none", 50, Number.NaN, "none"],
  ["safe", 50, 30, "safe"],
  ["watch", 50, 50, "watch"],
  ["danger", 50, 80, "danger"],
  ["late", 50, 101, "late"]
];

for (const [name, progressRate, bufferRate, expected] of evaluationCases) {
  test(`Goal Navi evaluation: ${name}`, async () => {
    const result = await callApi(page, "goalNaviEvaluation", progressRate, bufferRate);
    expect(result.id).toBe(expected);
  });
}

test("Goal Navi keeps note chart flags", async () => {
  const normalized = await callApi(page, "normalizeGoalNavi", goalNaviGraph({
    records: [
      { id: "r1", date: "2026-05-01", note: "show", showNoteOnChart: true, phases: {} }
    ]
  }));
  expect(normalized.records[0].note).toBe("show");
  expect(normalized.records[0].showNoteOnChart).toBe(true);
});

test("Goal Navi sorts records by date", async () => {
  const normalized = await callApi(page, "normalizeGoalNavi", goalNaviGraph({
    records: [
      { id: "late", date: "2026-05-15", phases: {} },
      { id: "early", date: "2026-05-01", phases: {} }
    ]
  }));
  expect(normalized.records.map(record => record.id)).toEqual(["early", "late"]);
});

test("Goal Navi sample late scenario has a latest row", async () => {
  const sample = await callApi(page, "sample", "goal-navi-late-scenario");
  const info = await callApi(page, "goalNaviInfo", sample.goalNavi || sample);
  expect(info.rows.length).toBeGreaterThan(5);
  expect(info.latest.progressRate).toBeGreaterThan(0);
});

test("Goal Navi sample late scenario includes manual velocity points", async () => {
  const sample = await callApi(page, "sample", "goal-navi-late-scenario");
  const info = await callApi(page, "goalNaviInfo", sample.goalNavi || sample);
  expect(info.rows.some(row => row.velocitySource === "manual")).toBe(true);
});
