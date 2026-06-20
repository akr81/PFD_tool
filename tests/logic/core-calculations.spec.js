const { test, expect } = require("@playwright/test");
const { loadApp, callApi } = require("../helpers/app");
const { pfdCriticalPathGraph } = require("../helpers/fixtures");

test.describe.configure({ mode: "serial" });

let page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await loadApp(page);
});

test.afterAll(async () => {
  if (page) await page.close();
});

const estimateCases = [
  ["empty string", "", 0],
  ["spaces", "   ", 0],
  ["plain integer days", "3", 3],
  ["plain decimal days", "1.5", 1.5],
  ["zero days", "0", 0],
  ["single d unit", "2d", 2],
  ["day unit", "1 day", 1],
  ["days unit", "3 days", 3],
  ["uppercase day unit", "4 DAYS", 4],
  ["hours h", "16h", 2],
  ["hours hr", "8hr", 1],
  ["hours hrs", "12hrs", 1.5],
  ["hours word", "4 hours", 0.5],
  ["minutes min", "480min", 1],
  ["minutes word", "60 minutes", 0.125],
  ["weeks w", "2w", 10],
  ["week word", "1 week", 5],
  ["weeks word", "3 weeks", 15],
  ["months mo", "2mo", 40],
  ["month word", "1 month", 20],
  ["months word", "1.5 months", 30],
  ["mixed day and hours", "1d 4h", 1.5],
  ["mixed week and day", "1w 2d", 7],
  ["mixed month week day", "1month 1week 1day", 26],
  ["mixed minutes and hours", "1h 30min", 0.1875],
  ["unknown text", "not an estimate", 0],
  ["number embedded in text", "about 2 days", 2],
  ["multiple spaces", "2   days  8 h", 3],
  ["comma normalized", "1,000", 1000],
  ["negative sign ignored as amount token", "-2d", 2],
  ["fractional hours", "2.5h", 0.3125],
  ["fractional weeks", "0.5week", 2.5]
];

for (const [name, input, expected] of estimateCases) {
  test(`estimateDaysFromText: ${name}`, async () => {
    const actual = await callApi(page, "estimateDaysFromText", input);
    expect(actual).toBeCloseTo(expected, 8);
  });
}

const normalizeEstimateCases = [
  ["trims whitespace", "  3d  ", "3d"],
  ["removes comma", "1,200", "1200"],
  ["keeps english unit", "8h", "8h"],
  ["empty null", null, ""],
  ["empty undefined", undefined, ""]
];

for (const [name, input, expected] of normalizeEstimateCases) {
  test(`normalizeEstimateText: ${name}`, async () => {
    const actual = await callApi(page, "normalizeEstimateText", input);
    expect(actual).toBe(expected);
  });
}

const project = {
  start: "2026-05-11",
  end: "2026-05-29",
  today: "2026-05-15",
  holidays: ["2026-05-18"],
  resources: ["Akira", "Mika"]
};

const workdaysBetweenCases = [
  ["same workday", "2026-05-11", "2026-05-11", 1],
  ["single week", "2026-05-11", "2026-05-15", 5],
  ["weekend excluded", "2026-05-11", "2026-05-17", 5],
  ["holiday excluded", "2026-05-11", "2026-05-18", 5],
  ["day after holiday", "2026-05-11", "2026-05-19", 6],
  ["second week end", "2026-05-11", "2026-05-22", 9],
  ["full project range", "2026-05-11", "2026-05-29", 14],
  ["end before start", "2026-05-20", "2026-05-11", 0]
];

for (const [name, start, end, expected] of workdaysBetweenCases) {
  test(`projectWorkdaysBetween: ${name}`, async () => {
    const actual = await callApi(page, "projectWorkdaysBetween", start, end, project);
    expect(actual).toBe(expected);
  });
}

const workdayOffsetCases = [
  ["start date", "projectWorkdayOffsetFromDate", "2026-05-11", 0],
  ["next date", "projectWorkdayOffsetFromDate", "2026-05-12", 1],
  ["friday", "projectWorkdayOffsetFromDate", "2026-05-15", 4],
  ["holiday", "projectWorkdayOffsetFromDate", "2026-05-18", 4],
  ["after start inclusive", "projectWorkdayOffsetAfterDate", "2026-05-11", 1],
  ["after friday inclusive", "projectWorkdayOffsetAfterDate", "2026-05-15", 5],
  ["after holiday unchanged", "projectWorkdayOffsetAfterDate", "2026-05-18", 5],
  ["after next workday", "projectWorkdayOffsetAfterDate", "2026-05-19", 6],
  ["calendar offset start", "projectCalendarOffsetFromDate", "2026-05-11", 0],
  ["calendar offset holiday", "projectCalendarOffsetFromDate", "2026-05-18", 7]
];

for (const [name, method, date, expected] of workdayOffsetCases) {
  test(`${method}: ${name}`, async () => {
    const actual = await callApi(page, method, date, project);
    expect(actual).toBe(expected);
  });
}

const workdayIsoCases = [
  ["offset 0", "projectWorkdayIsoFromOffset", 0, "2026-05-11"],
  ["offset 4", "projectWorkdayIsoFromOffset", 4, "2026-05-15"],
  ["offset 5 skips weekend and holiday", "projectWorkdayIsoFromOffset", 5, "2026-05-19"],
  ["calendar offset 0", "projectCalendarIsoFromOffset", 0, "2026-05-11"],
  ["calendar offset 7 is holiday", "projectCalendarIsoFromOffset", 7, "2026-05-18"]
];

for (const [name, method, offset, expected] of workdayIsoCases) {
  test(`${method}: ${name}`, async () => {
    const actual = await callApi(page, method, offset, project);
    expect(actual).toBe(expected);
  });
}

test("nextProjectWorkdayIso skips weekend and configured holiday", async () => {
  const actual = await callApi(page, "nextProjectWorkdayIso", "2026-05-15", project);
  expect(actual).toBe("2026-05-19");
});

test("normalizeProjectSettings keeps expected default structure", async () => {
  const normalized = await callApi(page, "normalizeProjectSettings", { start: "2026-05-11", resources: "Akira\nMika" });
  expect(normalized.start).toBe("2026-05-11");
  expect(normalized.end).toBe("");
  expect(normalized.resources).toEqual(["Akira", "Mika"]);
  expect(normalized.holidays).toEqual([]);
});

test("criticalPathInfo follows the longest PFD process path", async () => {
  await callApi(page, "loadGraph", pfdCriticalPathGraph());
  const info = await callApi(page, "criticalPathInfo");
  expect(info.totalDays).toBe(7);
  expect(info.doneDays).toBe(3);
  expect(info.progress).toBeCloseTo(3 / 7, 8);
  expect(info.edgeIds).toEqual(expect.arrayContaining(["e2", "e3", "e4"]));
});

test("criticalPathInfo excludes shorter branches", async () => {
  await callApi(page, "loadGraph", pfdCriticalPathGraph());
  const info = await callApi(page, "criticalPathInfo");
  expect(info.edgeIds).not.toContain("e5");
  expect(info.edgeIds).not.toContain("e6");
});

test("undo and redo restore graph payload changes", async () => {
  const graph = await callApi(page, "loadGraph", pfdCriticalPathGraph());
  await callApi(page, "recordHistory");
  await callApi(page, "mutateNode", "p2", { estimate: "10d" });
  expect((await callApi(page, "criticalPathInfo")).totalDays).toBe(13);
  await callApi(page, "undo");
  expect((await callApi(page, "criticalPathInfo")).totalDays).toBe(7);
  await callApi(page, "redo");
  expect((await callApi(page, "criticalPathInfo")).totalDays).toBe(13);
  expect(graph.nodes.length).toBe(7);
});
