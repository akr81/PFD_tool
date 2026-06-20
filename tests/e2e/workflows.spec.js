const { test, expect } = require("@playwright/test");
const { loadApp, callApi } = require("../helpers/app");

test.describe.configure({ mode: "serial" });

let page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await loadApp(page);
});

test.afterAll(async () => {
  if (page) await page.close();
});

async function clickEmptyCanvas(page) {
  const point = await page.evaluate(() => {
    const viewport = document.querySelector("#viewport").getBoundingClientRect();
    const blockedSelector = [
      ".node",
      ".port",
      ".edge-hit",
      ".edge-handle",
      ".mini-palette",
      ".dialog",
      ".detail-panel",
      "button",
      "select",
      "input",
      "textarea"
    ].join(",");
    for (let y = viewport.top + 36; y < viewport.bottom - 36; y += 36) {
      for (let x = viewport.left + 36; x < viewport.right - 36; x += 36) {
        const blocked = document.elementsFromPoint(x, y).some(element => element.closest?.(blockedSelector));
        if (!blocked) return { x, y };
      }
    }
    throw new Error("No empty canvas point found");
  });
  await page.mouse.click(point.x, point.y);
}

test("initial page exposes the diagram selector and one default PFD node", async () => {
  await callApi(page, "reset", "pfd");
  await expect(page.locator("#diagramTypeSelect")).toHaveValue("pfd");
  await expect(page.locator(".node")).toHaveCount(1);
});

test("mode buttons switch between simple and detail", async () => {
  await callApi(page, "reset", "pfd");
  await page.locator('[data-mode="detail"]').click();
  await expect(page.locator('[data-mode="detail"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator('[data-mode="simple"]').click();
  await expect(page.locator('[data-mode="simple"]')).toHaveAttribute("aria-pressed", "true");
});

test("diagram selector switches to CCPM and shows CCPM add tools", async () => {
  await callApi(page, "reset", "pfd");
  await page.locator("#diagramTypeSelect").selectOption("ccpm");
  await expect(page.locator("#diagramTypeSelect")).toHaveValue("ccpm");
  await expect(page.locator('[data-add-root="ccpm"]')).toBeVisible();
});

test("diagram selector switches to Goal Navi and hides diagram nodes", async () => {
  await callApi(page, "reset", "pfd");
  await page.locator("#diagramTypeSelect").selectOption("goal");
  await expect(page.locator("#diagramTypeSelect")).toHaveValue("goal");
  await expect(page.locator(".node")).toHaveCount(0);
});

test("sample selector loads CCPM sample", async () => {
  await callApi(page, "reset", "pfd");
  await page.locator("#sampleSelect").selectOption("ccpm-chain");
  await expect(page.locator("#diagramTypeSelect")).toHaveValue("ccpm");
  const payload = await callApi(page, "getState");
  expect(payload.nodes.length).toBeGreaterThan(3);
});

test("sample selector loads Goal Navi sample", async () => {
  await callApi(page, "reset", "pfd");
  await page.locator("#sampleSelect").selectOption("goal-navi-late-scenario");
  await expect(page.locator("#diagramTypeSelect")).toHaveValue("goal");
  const payload = await callApi(page, "getState");
  expect(payload.goalNavi.records.length).toBeGreaterThan(3);
});

test("only the selected node renders connection ports", async () => {
  await callApi(page, "reset", "pfd");
  await page.locator("#sampleSelect").selectOption("pfd-curry");
  await expect(page.locator(".node").nth(1)).toBeVisible();
  await expect(page.locator(".node.selected .port")).toHaveCount(4);
  await expect(page.locator(".node:not(.selected) .port")).toHaveCount(0);

  const payload = await callApi(page, "getState");
  const selectedId = payload.nodes[0].id;
  const nextNode = payload.nodes.find(node => node.id !== selectedId);
  await callApi(page, "selectNode", nextNode.id);

  await expect(page.locator(".node.selected .port")).toHaveCount(4);
  await expect(page.locator(".node:not(.selected) .port")).toHaveCount(0);
});

test("selected node is visually promoted above other nodes", async () => {
  await callApi(page, "reset", "pfd");
  await page.locator("#sampleSelect").selectOption("pfd-curry");
  const zIndex = await page.locator(".node.selected").first().evaluate(node => getComputedStyle(node).zIndex);
  expect(zIndex).toBe("8");
});

test("only the selected edge renders the edge action icon", async () => {
  await callApi(page, "reset", "pfd");
  await page.locator("#sampleSelect").selectOption("pfd-curry");
  await expect(page.locator(".edge-handle")).toHaveCount(0);

  const payload = await callApi(page, "getState");
  expect(payload.edges.length).toBeGreaterThan(0);
  const edgePoint = await page.locator(`.edge-hit[data-edge-id="${payload.edges[0].id}"]`).evaluate(edge => {
    const box = edge.getBoundingClientRect();
    return {
      x: box.left + box.width / 2,
      y: box.top + box.height / 2
    };
  });
  await page.mouse.click(edgePoint.x, edgePoint.y);

  await expect(page.locator(".edge-handle")).toHaveCount(1);
  await expect(page.locator(".edge-handle.selected")).toHaveCount(1);
  await expect(page.locator(".edge-handle:not(.selected)")).toHaveCount(0);
});

test("clicking empty canvas clears node and edge selection", async () => {
  await callApi(page, "reset", "pfd");
  await page.locator("#sampleSelect").selectOption("pfd-curry");
  await expect(page.locator(".node.selected")).toHaveCount(1);
  await expect(page.locator(".node.selected .port")).toHaveCount(4);

  await clickEmptyCanvas(page);

  await expect(page.locator(".node.selected")).toHaveCount(0);
  await expect(page.locator(".node .port")).toHaveCount(0);
  const payload = await callApi(page, "getState");

  const edgePoint = await page.locator(`.edge-hit[data-edge-id="${payload.edges[0].id}"]`).evaluate(edge => {
    const box = edge.getBoundingClientRect();
    return {
      x: box.left + box.width / 2,
      y: box.top + box.height / 2
    };
  });
  await page.mouse.click(edgePoint.x, edgePoint.y);
  await expect(page.locator(".edge-handle.selected")).toHaveCount(1);

  await clickEmptyCanvas(page);

  await expect(page.locator(".edge.selected")).toHaveCount(0);
  await expect(page.locator(".edge-handle")).toHaveCount(0);
});

test("add root process button adds a PFD node", async () => {
  await callApi(page, "reset", "pfd");
  await page.locator('[data-add-root="process"]').click();
  const payload = await callApi(page, "getState");
  expect(payload.nodes.length).toBe(2);
  expect(payload.nodes.some(node => node.type === "process")).toBe(true);
});

test("undo button reverts an added root node", async () => {
  await callApi(page, "reset", "pfd");
  await page.locator('[data-add-root="process"]').click();
  await expect(page.locator('[data-command="undo"]')).toBeEnabled();
  await page.locator('[data-command="undo"]').click();
  const payload = await callApi(page, "getState");
  expect(payload.nodes.length).toBe(1);
});

test("redo button restores an undone root node", async () => {
  await callApi(page, "reset", "pfd");
  await page.locator('[data-add-root="process"]').click();
  await page.locator('[data-command="undo"]').click();
  await expect(page.locator('[data-command="redo"]')).toBeEnabled();
  await page.locator('[data-command="redo"]').click();
  const payload = await callApi(page, "getState");
  expect(payload.nodes.length).toBe(2);
});

test("fit command remains clickable after sample load", async () => {
  await page.locator("#sampleSelect").selectOption("pfd-curry");
  await expect(page.locator('[data-command="fit"]')).toBeEnabled();
  await page.locator('[data-command="fit"]').click();
});

test("SVG download command produces a file", async () => {
  await callApi(page, "reset", "pfd");
  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-command="download-svg"]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.svg$/);
});

test("JSON download command produces a file", async () => {
  await callApi(page, "reset", "pfd");
  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-command="download"]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
});

test("CCPM sample renders gantt panel content", async () => {
  await page.locator("#sampleSelect").selectOption("ccpm-chain");
  await expect(page.locator(".gantt-panel")).toBeVisible();
  await expect(page.locator(".gantt-row[data-gantt-node]").first()).toBeVisible();
});

test("Goal Navi sample renders record rows", async () => {
  await page.locator("#sampleSelect").selectOption("goal-navi-late-scenario");
  await expect(page.locator(".goal-navi-shell")).toBeVisible();
  await expect(page.locator(".goal-record").first()).toBeVisible();
});
