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

test("normalizeGraphData keeps PFD memos separate from flow nodes", async () => {
  const normalized = await callApi(page, "normalizeGraphData", {
    diagramType: "pfd",
    nodes: [
      { id: "a", type: "artifact", text: "A" },
      { id: "p", type: "process", text: "P", estimate: "2d" },
      {
        id: "m",
        type: "memo",
        text: "Assumption note",
        detail: "hidden detail",
        estimate: "99d",
        owner: "Owner",
        statuses: ["done"],
        start: "2026-01-01",
        end: "2026-01-02",
        deadline: "2026-01-03",
        remains: 4,
        finished: true
      },
      {
        id: "m2",
        type: "memo",
        text: "Second note"
      }
    ],
    edges: [
      { id: "valid", from: "a", to: "p" },
      { id: "memo-source", from: "m", to: "p" },
      { id: "memo-target", from: "a", to: "m" },
      { id: "memo-memo", from: "m", to: "m2" }
    ]
  });
  const memo = normalized.nodes.find(node => node.id === "m");

  expect(memo.type).toBe("memo");
  expect(memo.text).toBe("Assumption note");
  expect(memo.detail).toBe("");
  expect(memo.estimate).toBe("");
  expect(memo.owner).toBe("");
  expect(memo.statuses).toEqual([]);
  expect(memo.start).toBe("");
  expect(memo.end).toBe("");
  expect(memo.deadline).toBe("");
  expect(memo.remains).toBe("");
  expect(memo.finished).toBe(false);
  expect(normalized.edges.map(edge => edge.id)).toEqual(["valid", "memo-source", "memo-target"]);
  expect(normalized.edges.find(edge => edge.id === "valid").kind).toBeUndefined();
  expect(normalized.edges.find(edge => edge.id === "memo-source").kind).toBe("annotation");
  expect(normalized.edges.find(edge => edge.id === "memo-target").kind).toBe("annotation");
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

test("normalizeGraphData fixes CRT to detail tree mode", async () => {
  const normalized = await callApi(page, "normalizeGraphData", {
    diagramType: "crt",
    crtLayoutMode: "compact",
    viewMode: "simple",
    nodes: [
      { id: "effect", type: "crt", text: "Effect", color: "Red" }
    ],
    edges: []
  });
  expect(normalized.viewMode).toBe("detail");
  expect(normalized.crtLayoutMode).toBe("tree");
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
    pfdReverseDirection: true,
    nodes: [
      { id: "a", type: "artifact", text: "A" },
      { id: "p", type: "process", text: "P", estimate: "2d" }
    ],
    edges: [{ id: "e", from: "a", to: "p" }],
    viewMode: "detail",
    nodeTextSize: 18
  });
  expect(payload.diagramType).toBe("pfd");
  expect(payload.pfdReverseDirection).toBe(true);
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
