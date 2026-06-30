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

test("detail panel opens directly in edit mode for PFD nodes", async () => {
  await callApi(page, "reset", "pfd");
  await page.locator(".node").first().dblclick();

  await expect(page.locator("#detailPanel")).toHaveClass(/open/);
  await expect(page.locator("#detailPanel")).toHaveClass(/editing/);
  await expect(page.locator("#detailTitle")).toHaveAttribute("contenteditable", "true");
  await expect(page.locator("#detailMarkdownEditor")).toBeVisible();
});

test("S&T detail panel opens with editable textareas", async () => {
  await callApi(page, "reset", "stt");
  await page.locator(".node").first().dblclick();

  await expect(page.locator("#detailPanel")).toHaveClass(/open/);
  await expect(page.locator("#detailPanel")).toHaveClass(/editing/);
  await expect(page.locator(".stt-detail-textarea")).toHaveCount(5);
});

test("S&T shortcut a adds an unconnected upper item with editable strategy and tactics", async () => {
  await callApi(page, "reset", "pfd");
  await page.locator("#diagramTypeSelect").focus();
  await page.locator("#diagramTypeSelect").selectOption("stt");
  await expect(page.locator("#diagramTypeSelect")).toHaveValue("stt");

  const initial = await callApi(page, "getState");
  const anchor = initial.nodes[0];

  await page.keyboard.press("a");

  await expect(page.locator("#detailPanel")).toHaveClass(/open/);
  await expect(page.locator("#detailPanel")).toHaveClass(/editing/);
  await expect(page.locator(".stt-detail-textarea")).toHaveCount(5);

  await page.locator('[data-stt-field="strategy"]').fill("上位戦略");
  await page.locator('[data-stt-field="tactics"]').fill("上位戦術");
  await page.keyboard.press("Control+Enter");

  const payload = await callApi(page, "getState");
  const added = payload.nodes.find(node => node.id !== anchor.id);

  expect(payload.edges).toHaveLength(0);
  expect(added.type).toBe("stt");
  expect(added.stt.strategy).toBe("上位戦略");
  expect(added.stt.tactics).toBe("上位戦術");
});

test("shortcut a places loose nodes closer and wraps them in three columns", async () => {
  await callApi(page, "loadGraph", {
    diagramType: "pfd",
    nodes: [
      { id: "goal", type: "artifact", text: "Goal", gridX: 0, gridY: 0 },
      { id: "step", type: "process", text: "Step", gridX: 1, gridY: 0 }
    ],
    edges: [{ id: "edge-goal-step", from: "goal", to: "step" }]
  });

  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press("a");
    const titleInput = page.locator("[data-title-input]");
    await expect(titleInput).toBeVisible();
    await titleInput.fill(`Loose ${i + 1}`);
    await titleInput.evaluate(element => element.blur());
    await expect(page.locator("[data-title-input]")).toHaveCount(0);
  }

  const payload = await callApi(page, "getState");
  const connectedMaxGridX = Math.max(
    ...payload.nodes
      .filter(node => node.id === "goal" || node.id === "step")
      .map(node => node.gridX)
  );
  const looseNodes = payload.nodes.filter(node => node.id !== "goal" && node.id !== "step");

  expect(looseNodes.map(node => [node.gridX, node.gridY])).toEqual([
    [connectedMaxGridX + 1, 0],
    [connectedMaxGridX + 2, 0],
    [connectedMaxGridX + 3, 0],
    [connectedMaxGridX + 1, 1]
  ]);
});

test("detail textareas grow to fit edited content", async () => {
  await callApi(page, "reset", "stt");
  await page.locator(".node").first().dblclick();

  const textarea = page.locator(".stt-detail-textarea").first();
  const beforeHeight = await textarea.evaluate(element => element.getBoundingClientRect().height);
  await textarea.fill([
    "1行目",
    "2行目",
    "3行目",
    "4行目",
    "5行目",
    "6行目",
    "7行目",
    "8行目",
    "9行目",
    "10行目"
  ].join("\n"));
  const metrics = await textarea.evaluate(element => ({
    height: element.getBoundingClientRect().height,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }));

  expect(metrics.height).toBeGreaterThan(beforeHeight);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);
});

test("unsaved detail edits prompt before leaving and can be saved", async () => {
  await callApi(page, "reset", "stt");
  await page.locator(".node").first().dblclick();

  await page.locator(".stt-detail-textarea").first().fill("未保存の仮説");

  let keepEditingMessage = "";
  page.once("dialog", async dialog => {
    keepEditingMessage = dialog.message();
    await dialog.dismiss();
  });
  await clickEmptyCanvas(page);
  expect(keepEditingMessage).toContain("未保存");

  await expect(page.locator("#detailPanel")).toHaveClass(/open/);
  await expect(page.locator(".stt-detail-textarea").first()).toHaveValue("未保存の仮説");

  let saveMessage = "";
  page.once("dialog", async dialog => {
    saveMessage = dialog.message();
    await dialog.accept();
  });
  await clickEmptyCanvas(page);
  expect(saveMessage).toContain("未保存");

  await expect(page.locator("#detailPanel")).not.toHaveClass(/open/);
  const payload = await callApi(page, "getState");
  expect(payload.nodes[0].stt.necessaryAssumption).toBe("未保存の仮説");
});

test("add root process button adds a PFD node", async () => {
  await callApi(page, "reset", "pfd");
  await page.locator('[data-add-root="process"]').click();
  const payload = await callApi(page, "getState");
  expect(payload.nodes.length).toBe(2);
  expect(payload.nodes.some(node => node.type === "process")).toBe(true);
});

test("PFD reverse direction flips horizontal layout and Tab adds upstream", async () => {
  const initial = await callApi(page, "reset", "pfd");
  const anchor = initial.nodes[0];
  await page.locator('[data-command="pfd-reverse"]').click();
  await expect(page.locator('[data-command="pfd-reverse"]')).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Tab");
  const payload = await callApi(page, "getState");
  const added = payload.nodes.find(node => node.id !== anchor.id);
  const currentAnchor = payload.nodes.find(node => node.id === anchor.id);

  expect(payload.pfdReverseDirection).toBe(true);
  expect(added.gridX).toBeGreaterThan(currentAnchor.gridX);
  expect(payload.edges).toEqual([
    expect.objectContaining({ from: added.id, to: anchor.id })
  ]);
});

test("PFD reverse direction flips vertical layout and Enter adds upstream", async () => {
  const initial = await callApi(page, "loadGraph", {
    diagramType: "pfd",
    pfdOrientation: "vertical",
    pfdReverseDirection: false,
    nodes: [{ id: "goal", type: "artifact", text: "Goal", gridX: 0, gridY: 0 }],
    edges: []
  });
  const anchor = initial.nodes[0];
  await page.locator('[data-command="pfd-reverse"]').click();

  await page.keyboard.press("Enter");
  const payload = await callApi(page, "getState");
  const added = payload.nodes.find(node => node.id !== anchor.id);
  const currentAnchor = payload.nodes.find(node => node.id === anchor.id);

  expect(payload.pfdOrientation).toBe("vertical");
  expect(payload.pfdReverseDirection).toBe(true);
  expect(added.gridY).toBeGreaterThan(currentAnchor.gridY);
  expect(payload.edges).toEqual([
    expect.objectContaining({ from: added.id, to: anchor.id })
  ]);
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
