const { test, expect } = require("@playwright/test");
const { loadApp, callApi } = require("../helpers/app");
const { ccpmSimpleGraph, ccpmResourceGraph } = require("../helpers/fixtures");

test.describe.configure({ mode: "serial" });

let page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await loadApp(page);
});

test.afterAll(async () => {
  if (page) await page.close();
});

async function scheduleFor(graph) {
  await callApi(page, "loadGraph", graph);
  return callApi(page, "ccpmScheduleInfo");
}

test("CCPM serial dependencies calculate start and finish offsets", async () => {
  const schedule = await scheduleFor(ccpmSimpleGraph());
  expect(schedule.tasks.map(task => [task.id, task.start, task.finish])).toEqual([
    ["t1", 1, 3],
    ["t2", 3, 6],
    ["t3", 6, 7]
  ]);
  expect(schedule.projectFinish).toBe(7);
});

test("CCPM serial dependencies mark the full chain critical", async () => {
  const schedule = await scheduleFor(ccpmSimpleGraph());
  expect(schedule.criticalNodeIds.sort()).toEqual(["t1", "t2", "t3"]);
  expect(schedule.criticalDuration).toBe(6);
  expect(schedule.criticalPlannedDuration).toBe(6);
});

test("CCPM total progress uses completed planned duration", async () => {
  const schedule = await scheduleFor(ccpmSimpleGraph({
    nodes: [
      { id: "done", type: "ccpm", text: "done extra", estimate: "4d", owner: "Akira", statuses: ["done"], finished: true, gridX: 0, gridY: 1 }
    ]
  }));
  expect(schedule.totalDays).toBe(10);
  expect(schedule.doneDays).toBe(4);
  expect(schedule.progress).toBeCloseTo(0.4, 8);
});

test("CCPM started task uses remains as remaining duration", async () => {
  const schedule = await scheduleFor(ccpmSimpleGraph({
    project: { today: "2026-05-13" },
    nodeOverrides: {
      t2: { estimate: "5d", statuses: ["progress"], start: "2026-05-11", remains: 2 }
    }
  }));
  const task = schedule.tasks.find(item => item.id === "t2");
  expect(task.remainingDuration).toBe(2);
  expect(task.duration).toBeGreaterThanOrEqual(task.remainingDuration);
});

test("CCPM finished task has zero remaining duration when remains is zero", async () => {
  const schedule = await scheduleFor(ccpmSimpleGraph({
    nodeOverrides: {
      t1: { statuses: ["done"], start: "2026-05-11", end: "2026-05-12", remains: 0, finished: true }
    }
  }));
  const task = schedule.tasks.find(item => item.id === "t1");
  expect(task.finished).toBe(true);
  expect(task.remainingDuration).toBe(0);
});

test("CCPM invalid estimate falls back and warns", async () => {
  const schedule = await scheduleFor(ccpmSimpleGraph({
    nodes: [
      { id: "bad", type: "ccpm", text: "bad", estimate: "n/a", owner: "Akira", statuses: [], gridX: 3, gridY: 0 }
    ],
    edges: [{ id: "e3", from: "t3", to: "bad" }]
  }));
  const bad = schedule.tasks.find(item => item.id === "bad");
  expect(bad.estimateFallback).toBe(true);
  expect(schedule.warnings.length).toBeGreaterThan(0);
});

test("CCPM detects dependency cycles", async () => {
  const schedule = await scheduleFor(ccpmSimpleGraph({
    edges: [{ id: "cycle", from: "t3", to: "t1" }]
  }));
  expect(schedule.hasCycle).toBe(true);
  expect(schedule.cycleNodeIds).toEqual(expect.arrayContaining(["t1", "t2", "t3"]));
});

test("CCPM resource capacity one serializes same-owner parallel tasks", async () => {
  const schedule = await scheduleFor(ccpmResourceGraph(["Akira", "Mika", "Sato"]));
  const a = schedule.tasks.find(task => task.id === "a");
  const b = schedule.tasks.find(task => task.id === "b");
  expect(schedule.resourceLinks.length).toBeGreaterThan(0);
  expect(Math.min(a.finish, b.finish)).toBeLessThanOrEqual(Math.max(a.start, b.start));
});

test("CCPM resource capacity two allows same-owner parallel tasks", async () => {
  const schedule = await scheduleFor(ccpmResourceGraph(["Akira:2", "Mika", "Sato"]));
  const a = schedule.tasks.find(task => task.id === "a");
  const b = schedule.tasks.find(task => task.id === "b");
  expect(a.start).toBe(1);
  expect(b.start).toBe(1);
});

test("CCPM parses resource capacity settings", async () => {
  await callApi(page, "loadGraph", ccpmResourceGraph(["Akira:2", "Mika", "Sato:3"]));
  const settings = await callApi(page, "ccpmResourceSettings");
  expect(settings.capacities).toMatchObject({ Akira: 2, Mika: 1, Sato: 3 });
  expect(settings.totalCapacity).toBe(6);
});

test("CCPM multiple owners are split and trimmed", async () => {
  const owners = await callApi(page, "ccpmOwnerNames", "Akira, Mika\nSato");
  expect(owners).toEqual(["Akira", "Mika", "Sato"]);
});

test("CCPM project buffer uses project end when no baseline exists", async () => {
  const schedule = await scheduleFor(ccpmSimpleGraph());
  expect(schedule.projectBufferDays).toBe(8);
  expect(schedule.projectBufferStart).toBe(6);
  expect(schedule.projectBufferEnd).toBe(14);
});

test("CCPM baseline fixes project buffer values", async () => {
  const schedule = await scheduleFor(ccpmSimpleGraph({
    project: {
      baseline: {
        cc_length: 6,
        total_buffer: 3,
        registered_at: "2026-05-11",
        project_finish: "2026-05-20"
      }
    }
  }));
  expect(schedule.projectBufferStart).toBe(6);
  expect(schedule.projectBufferDays).toBe(3);
  expect(schedule.projectBufferEnd).toBe(9);
});

test("CCPM today boundary advances to configured today", async () => {
  const schedule = await scheduleFor(ccpmSimpleGraph({ project: { today: "2026-05-15" } }));
  expect(schedule.todayBoundaryOffset).toBe(5);
});

test("CCPM check items report missing baseline", async () => {
  await callApi(page, "loadGraph", ccpmSimpleGraph());
  const items = await callApi(page, "ccpmCheckItems");
  expect(items.some(item => item.severity === "warning")).toBe(true);
});

test("CCPM check items report cycle as danger", async () => {
  await callApi(page, "loadGraph", ccpmSimpleGraph({
    edges: [{ id: "cycle", from: "t3", to: "t1" }]
  }));
  const items = await callApi(page, "ccpmCheckItems");
  expect(items.some(item => item.severity === "danger")).toBe(true);
});

const sampleExpectations = [
  ["ccpm-chain", { projectFinish: 14, criticalDuration: 13, totalDays: 14 }],
  ["ccpm-resource-priority", { hasResourceLinks: true }],
  ["ccpm-warnings", { hasCycle: true }]
];

for (const [sampleId, expected] of sampleExpectations) {
  test(`CCPM sample schedule smoke: ${sampleId}`, async () => {
    const sample = await callApi(page, "sample", sampleId);
    const schedule = await scheduleFor(sample);
    if ("projectFinish" in expected) expect(schedule.projectFinish).toBe(expected.projectFinish);
    if ("criticalDuration" in expected) expect(schedule.criticalDuration).toBe(expected.criticalDuration);
    if ("totalDays" in expected) expect(schedule.totalDays).toBe(expected.totalDays);
    if (expected.hasResourceLinks) expect(schedule.resourceLinks.length).toBeGreaterThan(0);
    if (expected.hasCycle) expect(schedule.hasCycle).toBe(true);
  });
}

const estimateFallbackCases = [
  ["blank", ""],
  ["letters", "abc"],
  ["symbol", "--"]
];

for (const [name, estimate] of estimateFallbackCases) {
  test(`CCPM fallback estimate: ${name}`, async () => {
    const schedule = await scheduleFor(ccpmSimpleGraph({
      nodes: [
        { id: "bad", type: "ccpm", text: "bad", estimate, owner: "Akira", statuses: [], gridX: 3, gridY: 0 }
      ],
      edges: [{ id: "e3", from: "t3", to: "bad" }]
    }));
    expect(schedule.tasks.find(task => task.id === "bad").estimateFallback).toBe(true);
  });
}
