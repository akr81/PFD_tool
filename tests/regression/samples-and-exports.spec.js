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
