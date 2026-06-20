const { test, expect } = require("@playwright/test");
const { loadApp, callApi, withApi } = require("../helpers/app");

test.describe.configure({ mode: "serial" });

let page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await loadApp(page);
});

test.afterAll(async () => {
  if (page) await page.close();
});

const diagramResetCases = [
  ["pfd", 1, "artifact"],
  ["stt", 1, "stt"],
  ["crt", 1, "crt"],
  ["ccpm", 1, "ccpm"],
  ["ec", 9, "ec"],
  ["goal", 0, undefined]
];

for (const [diagramType, expectedNodeCount, expectedType] of diagramResetCases) {
  test(`reset creates default ${diagramType} state`, async () => {
    const state = await callApi(page, "reset", diagramType);
    expect(state.diagramType).toBe(diagramType);
    expect(state.nodes).toHaveLength(expectedNodeCount);
    if (expectedType) expect(state.nodes[0].type).toBe(expectedType);
  });
}

test("normalizeGraphData rejects graph without nodes", async () => {
  const result = await withApi(page, api => {
    try {
      api.normalizeGraphData({ nodes: [], edges: [] });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  });
  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("normalizeGraphData removes edges that point to missing nodes", async () => {
  const normalized = await callApi(page, "normalizeGraphData", {
    nodes: [
      { id: "a", type: "artifact", text: "A" },
      { id: "p", type: "process", text: "P" }
    ],
    edges: [
      { id: "valid", from: "a", to: "p" },
      { id: "missing-source", from: "x", to: "p" },
      { id: "missing-target", from: "p", to: "y" }
    ]
  });
  expect(normalized.edges.map(edge => edge.id)).toEqual(["valid"]);
});

test("normalizeGraphData infers S&T diagram from fields", async () => {
  const normalized = await callApi(page, "normalizeGraphData", {
    nodes: [
      { id: "s1", type: "node", text: "1", strategy: "Strategy" }
    ],
    edges: []
  });
  expect(normalized.diagramType).toBe("stt");
  expect(normalized.nodes[0].type).toBe("stt");
  expect(normalized.nodes[0].stt.strategy).toBe("Strategy");
});

test("normalizeGraphData infers CRT diagram from legacy shape", async () => {
  const normalized = await callApi(page, "normalizeGraphData", {
    nodes: [
      { id: "c1", type: "entity", text: "Cause" },
      { id: "c2", type: "note", text: "Effect" }
    ],
    edges: [
      { id: "e1", from: "c1", to: "c2", type: "arrow", and: "1" }
    ]
  });
  expect(normalized.diagramType).toBe("crt");
  expect(normalized.nodes.every(node => node.type === "crt")).toBe(true);
  expect(normalized.edges[0].and).toBe("1");
});

test("normalizeGraphData infers EC diagram from fixed IDs", async () => {
  const normalized = await callApi(page, "normalizeGraphData", {
    nodes: [
      { id: "head", text: "A" },
      { id: "left_shoulder", text: "B" },
      { id: "right_shoulder", text: "C" },
      { id: "left_hand", text: "D" },
      { id: "right_hand", text: "D2" }
    ],
    edges: []
  });
  expect(normalized.diagramType).toBe("ec");
  expect(normalized.nodes).toHaveLength(9);
  expect(normalized.edges.some(edge => edge.kind === "conflict")).toBe(true);
});

test("goal-shaped payload normalizes as Goal Navi", async () => {
  const normalized = await callApi(page, "normalizeGraphData", {
    diagramType: "goal",
    project: { start: "2026-05-01", end: "2026-05-29" },
    phases: [{ id: "p1", name: "Phase", plannedDays: "10" }],
    records: []
  });
  expect(normalized.diagramType).toBe("goal");
  expect(normalized.nodes).toEqual([]);
  expect(normalized.goalNavi.phases[0].plannedDays).toBe(10);
});

test("loadGraph persists and returns graphPayload shape", async () => {
  const payload = await callApi(page, "loadGraph", {
    diagramType: "pfd",
    nodes: [
      { id: "a", type: "artifact", text: "A" },
      { id: "p", type: "process", text: "P", estimate: "2d" }
    ],
    edges: [{ id: "e", from: "a", to: "p" }],
    viewMode: "detail",
    nodeTextSize: 18
  });
  expect(payload.diagramType).toBe("pfd");
  expect(payload.viewMode).toBe("detail");
  expect(payload.nodeTextSize).toBe(18);
  expect(payload.nodes).toHaveLength(2);
  expect(payload.edges).toHaveLength(1);
});

test("parseGraphJson unwraps embedded graph metadata", async () => {
  const parsed = await callApi(page, "parseGraphJson", JSON.stringify({
    app: "pfd-sketch",
    type: "pfd-sketch-graph",
    graph: {
      diagramType: "pfd",
      nodes: [{ id: "a", type: "artifact", text: "A" }],
      edges: []
    }
  }));
  expect(parsed.diagramType).toBe("pfd");
  expect(parsed.nodes[0].id).toBe("a");
});

const sampleIds = [
  "pfd-curry",
  "stt-home",
  "crt-project",
  "crt-study-time",
  "ec-conflict",
  "goal-navi-sample",
  "goal-navi-late-scenario",
  "ccpm-chain",
  "ccpm-original-like",
  "ccpm-original-like-middle",
  "ccpm-original-like-late",
  "ccpm-resource-priority",
  "ccpm-warnings"
];

for (const sampleId of sampleIds) {
  test(`bundled sample normalizes: ${sampleId}`, async () => {
    const sample = await callApi(page, "sample", sampleId);
    const normalized = await callApi(page, "normalizeGraphData", sample);
    expect(normalized.diagramType).toBeTruthy();
    if (normalized.diagramType === "goal") {
      expect(normalized.goalNavi.phases.length).toBeGreaterThan(0);
    } else {
      expect(normalized.nodes.length).toBeGreaterThan(0);
    }
  });
}
