const { test, expect } = require("@playwright/test");
const { loadApp, callApi } = require("../helpers/app");
const { pfdCriticalPathGraph, ccpmSimpleGraph, goalNaviGraph } = require("../helpers/fixtures");

test.describe.configure({ mode: "serial" });

let page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await loadApp(page);
});

test.afterAll(async () => {
  if (page) await page.close();
});

test("sample registry exposes all bundled samples", async () => {
  const samples = await callApi(page, "samples");
  expect(samples.length).toBeGreaterThanOrEqual(13);
  expect(samples.map(sample => sample.id)).toEqual(expect.arrayContaining([
    "pfd-curry",
    "stt-home",
    "crt-project",
    "ec-conflict",
    "ccpm-chain",
    "goal-navi-late-scenario"
  ]));
});

const sampleSmoke = [
  ["pfd-curry", "pfd"],
  ["stt-home", "stt"],
  ["crt-project", "crt"],
  ["crt-study-time", "crt"],
  ["ec-conflict", "ec"],
  ["goal-navi-sample", "goal"],
  ["goal-navi-late-scenario", "goal"],
  ["ccpm-chain", "ccpm"],
  ["ccpm-original-like", "ccpm"],
  ["ccpm-original-like-middle", "ccpm"],
  ["ccpm-original-like-late", "ccpm"],
  ["ccpm-resource-priority", "ccpm"],
  ["ccpm-warnings", "ccpm"]
];

for (const [sampleId, diagramType] of sampleSmoke) {
  test(`sample load round trip: ${sampleId}`, async () => {
    const sample = await callApi(page, "sample", sampleId);
    const payload = await callApi(page, "loadGraph", sample);
    expect(payload.diagramType).toBe(diagramType);
    if (diagramType === "goal") {
      expect(payload.goalNavi.phases.length).toBeGreaterThan(0);
    } else {
      expect(payload.nodes.length).toBeGreaterThan(0);
    }
    if (diagramType === "crt") {
      expect(payload.viewMode).toBe("detail");
      expect(payload.crtLayoutMode).toBe("tree");
    }
  });
}

test("embeddedGraphJson contains app metadata and graph payload", async () => {
  await callApi(page, "loadGraph", pfdCriticalPathGraph());
  const metadata = JSON.parse(await callApi(page, "embeddedGraphJson"));
  expect(metadata.app).toBeTruthy();
  expect(metadata.type).toBeTruthy();
  expect(metadata.graph.diagramType).toBe("pfd");
  expect(metadata.graph.nodes).toHaveLength(7);
});

test("PFD memo nodes round trip through payload and SVG metadata", async () => {
  await callApi(page, "loadGraph", {
    diagramType: "pfd",
    viewMode: "detail",
    nodes: [
      { id: "a", type: "artifact", text: "A", gridX: 0, gridY: 0 },
      { id: "p", type: "process", text: "P", estimate: "2d", gridX: 1, gridY: 0 },
      {
        id: "memo-1",
        type: "memo",
        text: "Assumptions\nOutside the flow",
        estimate: "99d",
        owner: "Owner",
        statuses: ["done"],
        detail: "hidden detail",
        gridX: 2,
        gridY: 0
      }
    ],
    edges: [
      { id: "edge-a-p", from: "a", to: "p" },
      { id: "edge-m-p", from: "memo-1", to: "p" }
    ]
  });

  const payload = await callApi(page, "graphPayload");
  const memo = payload.nodes.find(node => node.id === "memo-1");
  expect(memo).toEqual(expect.objectContaining({
    type: "memo",
    text: "Assumptions\nOutside the flow",
    detail: "",
    estimate: "",
    owner: "",
    statuses: []
  }));
  expect(payload.edges.map(edge => edge.id)).toEqual(["edge-a-p", "edge-m-p"]);
  expect(payload.edges.find(edge => edge.id === "edge-m-p")).toEqual(expect.objectContaining({
    from: "memo-1",
    to: "p",
    kind: "annotation"
  }));

  const metadata = JSON.parse(await callApi(page, "embeddedGraphJson"));
  expect(metadata.graph.nodes.find(node => node.id === "memo-1").type).toBe("memo");
  expect(metadata.graph.edges.find(edge => edge.id === "edge-m-p").kind).toBe("annotation");

  const svg = await callApi(page, "buildDiagramExport", { includeMetadata: true });
  expect(svg).toContain("export-node-memo-fold");
  expect(svg).toContain("export-edge-annotation");
  expect(svg).toMatch(/class="export-edge export-edge-annotation"[^>]*>/);
  expect(svg).not.toMatch(/class="export-edge export-edge-annotation"[^>]*marker-end=/);
  expect(svg).toContain("Assumptions");
  const parsed = JSON.parse(await callApi(page, "extractEmbeddedGraphJsonFromSvg", svg));
  expect(parsed.graph.nodes.find(node => node.id === "memo-1").type).toBe("memo");
  expect(parsed.graph.edges.find(edge => edge.id === "edge-m-p").kind).toBe("annotation");
});

test("SVG export embeds editable graph metadata", async () => {
  await callApi(page, "loadGraph", pfdCriticalPathGraph());
  const svg = await callApi(page, "buildDiagramExport", { includeMetadata: true });
  expect(svg).toContain("<svg");
  expect(svg).toContain("<metadata");
  const extracted = await callApi(page, "extractEmbeddedGraphJsonFromSvg", svg);
  const parsed = JSON.parse(extracted);
  expect(parsed.graph.diagramType).toBe("pfd");
  expect(parsed.graph.nodes.length).toBe(7);
});

test("PNG metadata round trip keeps editable graph metadata", async () => {
  await callApi(page, "loadGraph", ccpmSimpleGraph());
  const extracted = await callApi(page, "pngMetadataRoundTrip");
  const parsed = JSON.parse(extracted);
  expect(parsed.graph.diagramType).toBe("ccpm");
  expect(parsed.graph.nodes.length).toBe(3);
});

test("parseGraphJson reads metadata produced by embeddedGraphJson", async () => {
  await callApi(page, "loadGraph", goalNaviGraph());
  const metadata = await callApi(page, "embeddedGraphJson");
  const parsed = await callApi(page, "parseGraphJson", metadata);
  expect(parsed.diagramType).toBe("goal");
  expect(parsed.goalNavi.phases.length).toBe(2);
});

test("localStorage state can be read back through graphPayload", async () => {
  await callApi(page, "loadGraph", ccpmSimpleGraph());
  const payload = await callApi(page, "graphPayload");
  expect(payload.diagramType).toBe("ccpm");
  expect(payload.nodes.map(node => node.id)).toEqual(["t1", "t2", "t3"]);
});

test("exported SVG contains visible node text", async () => {
  await callApi(page, "loadGraph", pfdCriticalPathGraph());
  const svg = await callApi(page, "buildDiagramExport", {});
  expect(svg).toContain("request");
  expect(svg).toContain("design");
  expect(svg).toContain("release");
});

test("exported SVG contains CCPM resource classes when resource links exist", async () => {
  const sample = await callApi(page, "sample", "ccpm-resource-priority");
  await callApi(page, "loadGraph", sample);
  const svg = await callApi(page, "buildDiagramExport", {});
  expect(svg).toContain("export-edge-resource");
});
