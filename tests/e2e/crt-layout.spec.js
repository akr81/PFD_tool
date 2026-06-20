const { test, expect } = require("@playwright/test");
const { loadApp, callApi } = require("../helpers/app");

async function loadCrtSample(page, sampleId, layoutMode = "tree") {
  const sample = await callApi(page, "sample", sampleId);
  await callApi(page, "loadGraph", sample);
  if (layoutMode !== "tree") return callApi(page, "setCrtLayoutMode", layoutMode);
  return callApi(page, "getState");
}

async function diagonalEdgeSegments(page) {
  return page.locator("path.edge.edge-dynamic:not(.edge-hit)").evaluateAll(edges => {
    const diagonal = [];
    const numberPattern = /-?\d+(?:\.\d+)?/g;
    const commandsForPath = d => d.match(/[MLQ][^MLQ]*/g) || [];

    edges.forEach((edge, edgeIndex) => {
      let current = null;
      commandsForPath(edge.getAttribute("d") || "").forEach(command => {
        const type = command[0];
        const values = (command.match(numberPattern) || []).map(Number);
        if (type === "M" && values.length >= 2) {
          current = { x: values[0], y: values[1] };
          return;
        }
        if (type === "L" && current && values.length >= 2) {
          const next = { x: values[0], y: values[1] };
          if (Math.abs(next.x - current.x) > 0.1 && Math.abs(next.y - current.y) > 0.1) {
            diagonal.push({ edgeIndex, from: current, to: next });
          }
          current = next;
          return;
        }
        if (type === "Q" && values.length >= 4) {
          current = { x: values[2], y: values[3] };
        }
      });
    });

    return diagonal;
  });
}

async function renderedEdgeEndpoint(page, edgeId) {
  return page.locator(`path.edge.edge-dynamic[data-edge-id="${edgeId}"]:not(.edge-hit)`).evaluate(edge => {
    const numberPattern = /-?\d+(?:\.\d+)?/g;
    const commands = (edge.getAttribute("d") || "").match(/[MLQ][^MLQ]*/g) || [];
    let start = null;
    let current = null;

    commands.forEach(command => {
      const type = command[0];
      const values = (command.match(numberPattern) || []).map(Number);
      if (type === "M" && values.length >= 2) {
        current = { x: values[0], y: values[1] };
        if (!start) start = current;
        return;
      }
      if (type === "L" && values.length >= 2) {
        current = { x: values[0], y: values[1] };
        return;
      }
      if (type === "Q" && values.length >= 4) {
        current = { x: values[2], y: values[3] };
      }
    });

    return { start, end: current };
  });
}

async function edgeIntersectsNode(page, edgeId, nodeId, padding = 0) {
  return edgeIntersectsElement(page, edgeId, `.node[data-node-id="${nodeId}"]`, padding);
}

async function edgeIntersectsElement(page, edgeId, selector, padding = 0) {
  return page.locator(`path.edge.edge-dynamic[data-edge-id="${edgeId}"]:not(.edge-hit)`).evaluate((edge, args) => {
    const element = document.querySelector(args.selector);
    if (!element || typeof edge.getTotalLength !== "function") return false;
    const centerX = Number.parseFloat(element.style.left);
    const centerY = Number.parseFloat(element.style.top);
    const rect = {
      left: centerX - element.offsetWidth / 2 - args.padding,
      right: centerX + element.offsetWidth / 2 + args.padding,
      top: centerY - element.offsetHeight / 2 - args.padding,
      bottom: centerY + element.offsetHeight / 2 + args.padding
    };
    const length = edge.getTotalLength();
    const step = 6;
    const insideRect = point =>
      point.x >= rect.left && point.x <= rect.right
        && point.y >= rect.top && point.y <= rect.bottom;

    for (let distance = 0; distance <= length; distance += step) {
      if (insideRect(edge.getPointAtLength(distance))) return true;
    }
    return insideRect(edge.getPointAtLength(length));
  }, { selector, padding });
}

test("CRT samples render edges without diagonal line segments", async ({ page }) => {
  await loadApp(page);

  for (const sampleId of ["crt-project", "crt-study-time"]) {
    for (const layoutMode of ["tree", "compact"]) {
      await loadCrtSample(page, sampleId, layoutMode);
      expect(await diagonalEdgeSegments(page), `${sampleId} ${layoutMode}`).toEqual([]);
    }
  }
});

test("CRT causal edges use top and bottom virtual ports", async ({ page }) => {
  await loadApp(page);
  const payload = await callApi(page, "loadGraph", {
    diagramType: "crt",
    crtLayoutMode: "tree",
    viewMode: "simple",
    nodeTextSize: 13,
    nodes: [
      { id: "effect", type: "crt", text: "effect", color: "Red" },
      { id: "middle", type: "crt", text: "middle", color: "Yellow" },
      { id: "left-cause", type: "crt", text: "left cause", color: "Blue" },
      { id: "right-cause", type: "crt", text: "right cause", color: "Blue" }
    ],
    edges: [
      { id: "edge-middle-effect", from: "middle", to: "effect" },
      { id: "edge-left-middle", from: "left-cause", to: "middle" },
      { id: "edge-right-middle", from: "right-cause", to: "middle" }
    ]
  });
  const middle = payload.nodes.find(node => node.id === "middle");
  const top = middle.y - 54;
  const bottom = middle.y + 54;
  const outgoing = await renderedEdgeEndpoint(page, "edge-middle-effect");
  const incomingLeft = await renderedEdgeEndpoint(page, "edge-left-middle");
  const incomingRight = await renderedEdgeEndpoint(page, "edge-right-middle");

  expect(Math.abs(outgoing.start.y - top)).toBeLessThan(1);
  expect(Math.abs(incomingLeft.end.y - bottom)).toBeLessThan(1);
  expect(Math.abs(incomingRight.end.y - bottom)).toBeLessThan(1);
  expect(Math.abs(incomingLeft.end.x - incomingRight.end.x)).toBeGreaterThan(30);
});

test("CRT virtual ports keep aligned two-input edges straight", async ({ page }) => {
  await loadApp(page);
  await callApi(page, "loadGraph", {
    diagramType: "crt",
    crtLayoutMode: "tree",
    viewMode: "simple",
    nodeTextSize: 13,
    nodes: [
      { id: "effect", type: "crt", text: "effect", color: "Red" },
      { id: "target", type: "crt", text: "target", color: "Yellow" },
      { id: "aligned", type: "crt", text: "aligned", color: "Blue" },
      { id: "side", type: "crt", text: "side", color: "Blue" }
    ],
    edges: [
      { id: "edge-target-effect", from: "target", to: "effect" },
      { id: "edge-aligned-target", from: "aligned", to: "target" },
      { id: "edge-side-target", from: "side", to: "target" }
    ]
  });

  await callApi(page, "mutateNode", "effect", { x: 0, y: 0, gridX: 0, gridY: 0 });
  await callApi(page, "mutateNode", "target", { x: 0, y: 210, gridX: 0, gridY: 1 });
  await callApi(page, "mutateNode", "aligned", { x: 0, y: 420, gridX: 0, gridY: 2 });
  await callApi(page, "mutateNode", "side", { x: -300, y: 420, gridX: -1, gridY: 2 });

  const state = await callApi(page, "getState");
  const target = state.nodes.find(node => node.id === "target");
  const aligned = await renderedEdgeEndpoint(page, "edge-aligned-target");
  const side = await renderedEdgeEndpoint(page, "edge-side-target");

  expect(Math.abs(aligned.start.x - aligned.end.x)).toBeLessThan(1);
  expect(Math.abs(aligned.end.x - target.x)).toBeLessThan(1);
  expect(Math.abs(side.end.x - target.x)).toBeGreaterThan(20);
});

test("CRT long AND routes keep clearance from middle nodes", async ({ page }) => {
  await loadApp(page);
  await loadCrtSample(page, "crt-study-time", "tree");

  expect(await edgeIntersectsNode(page, "study-edge-7", "sleep_short", 40)).toBe(false);
  expect(await edgeIntersectsNode(page, "study-edge-7", "chores_night", 8)).toBe(false);
  expect(await edgeIntersectsNode(page, "study-edge-7", "residual_work", -1)).toBe(false);
  expect(await edgeIntersectsElement(page, "study-edge-7", '.crt-and-node[data-crt-target-id="sleep_short"]', 8)).toBe(false);
});

test("CRT simple cause chains stay vertically aligned", async ({ page }) => {
  await loadApp(page);
  const pairs = [
    ["node_already_evening", "node_give_up_going_out"],
    ["node_give_up_going_out", "ude_self_hatred"],
    ["node_wonder_what_to_do", "node_watch_smartphone"],
    ["root_no_plan", "node_wonder_what_to_do"],
    ["root_stay_up_late", "node_sleep_in"]
  ];

  for (const layoutMode of ["tree", "compact"]) {
    const payload = await loadCrtSample(page, "crt-project", layoutMode);
    const nodes = new Map(payload.nodes.map(node => [node.id, node]));
    pairs.forEach(([fromId, toId]) => {
      expect(Math.abs(nodes.get(fromId).x - nodes.get(toId).x), `${layoutMode} ${fromId} -> ${toId}`).toBeLessThan(1);
    });
  }
});

test("single CRT AND nodes align vertically with their targets", async ({ page }) => {
  await loadApp(page);

  for (const sampleId of ["crt-project", "crt-study-time"]) {
    for (const layoutMode of ["tree", "compact"]) {
      await loadCrtSample(page, sampleId, layoutMode);
      const misaligned = await page.locator(".crt-and-node[data-crt-single-target='true']").evaluateAll(andNodes => {
        return andNodes
          .map(andNode => {
            const target = document.querySelector(`.node[data-node-id="${andNode.dataset.crtTargetId}"]`);
            if (!target) return null;
            const andCenterX = Number.parseFloat(andNode.style.left);
            const targetCenterX = Number.parseFloat(target.style.left);
            return {
              andId: andNode.dataset.crtAndId,
              targetId: andNode.dataset.crtTargetId,
              delta: Math.abs(andCenterX - targetCenterX)
            };
          })
          .filter(item => item && item.delta > 1);
      });

      expect(misaligned, `${sampleId} ${layoutMode}`).toEqual([]);
    }
  }
});

test("single-target CRT AND input nodes center around their target", async ({ page }) => {
  await loadApp(page);
  const payload = await loadCrtSample(page, "crt-study-time", "tree");
  const nodes = new Map(payload.nodes.map(node => [node.id, node]));
  const target = nodes.get("study_slot_taken");
  const leftInput = nodes.get("no_calendar_block");
  const rightInput = nodes.get("accept_requests");
  const inputCenter = (leftInput.gridX + rightInput.gridX) / 2;

  expect(Math.abs(inputCenter - target.gridX)).toBeLessThan(0.01);
  expect(leftInput.gridX).toBeLessThan(target.gridX);
  expect(rightInput.gridX).toBeGreaterThan(target.gridX);
});

test("CRT layout mode switches between tree and compact layouts", async ({ page }) => {
  await loadApp(page);
  await expect(page.locator("#crtLayoutToolbar")).toBeHidden();

  const treePayload = await loadCrtSample(page, "crt-project");
  await expect(page.locator("#crtLayoutToolbar")).toBeVisible();
  await expect(page.locator('[data-crt-layout-mode="tree"]')).toHaveAttribute("aria-pressed", "true");
  expect(treePayload.crtLayoutMode).toBe("tree");

  await page.locator('[data-crt-layout-mode="compact"]').click();
  await expect(page.locator('[data-crt-layout-mode="compact"]')).toHaveAttribute("aria-pressed", "true");
  const compactPayload = await callApi(page, "getState");
  expect(compactPayload.crtLayoutMode).toBe("compact");

  await page.locator('[data-crt-layout-mode="tree"]').click();
  await expect(page.locator('[data-crt-layout-mode="tree"]')).toHaveAttribute("aria-pressed", "true");
  expect((await callApi(page, "getState")).crtLayoutMode).toBe("tree");
});

test("CRT tree layout orders connected branches consistently", async ({ page }) => {
  await loadApp(page);
  const payload = await callApi(page, "loadGraph", {
    diagramType: "crt",
    crtLayoutMode: "tree",
    nodes: [
      { id: "effect-a", type: "crt", text: "効果A", color: "Red" },
      { id: "effect-b", type: "crt", text: "効果B", color: "Red" },
      { id: "cause-c", type: "crt", text: "原因C", color: "Blue" },
      { id: "cause-d", type: "crt", text: "原因D", color: "Blue" }
    ],
    edges: [
      { id: "edge-c-b", from: "cause-c", to: "effect-b" },
      { id: "edge-d-a", from: "cause-d", to: "effect-a" }
    ]
  });
  const nodes = new Map(payload.nodes.map(node => [node.id, node]));

  expect(nodes.get("effect-a").x).toBeLessThan(nodes.get("effect-b").x);
  expect(nodes.get("cause-d").x).toBeLessThan(nodes.get("cause-c").x);
});

test("CRT tree layout keeps lower-level cause groups contiguous", async ({ page }) => {
  await loadApp(page);
  const payload = await callApi(page, "loadGraph", {
    diagramType: "crt",
    crtLayoutMode: "tree",
    nodes: [
      { id: "effect", type: "crt", text: "望ましくない結果", color: "Red" },
      { id: "mid-a", type: "crt", text: "中間原因A", color: "Yellow" },
      { id: "mid-b", type: "crt", text: "中間原因B", color: "Yellow" },
      { id: "leaf-b-1", type: "crt", text: "Bの根本原因1", color: "Blue" },
      { id: "leaf-a-1", type: "crt", text: "Aの根本原因1", color: "Blue" },
      { id: "leaf-b-2", type: "crt", text: "Bの根本原因2", color: "Blue" },
      { id: "leaf-a-2", type: "crt", text: "Aの根本原因2", color: "Blue" }
    ],
    edges: [
      { id: "edge-mid-a-effect", from: "mid-a", to: "effect" },
      { id: "edge-mid-b-effect", from: "mid-b", to: "effect" },
      { id: "edge-a-1-mid-a", from: "leaf-a-1", to: "mid-a" },
      { id: "edge-a-2-mid-a", from: "leaf-a-2", to: "mid-a" },
      { id: "edge-b-1-mid-b", from: "leaf-b-1", to: "mid-b" },
      { id: "edge-b-2-mid-b", from: "leaf-b-2", to: "mid-b" }
    ]
  });
  const nodes = new Map(payload.nodes.map(node => [node.id, node]));
  const span = ids => {
    const xs = ids.map(id => nodes.get(id).x);
    return { min: Math.min(...xs), max: Math.max(...xs) };
  };
  const spanA = span(["mid-a", "leaf-a-1", "leaf-a-2"]);
  const spanB = span(["mid-b", "leaf-b-1", "leaf-b-2"]);
  const branchesDoNotInterleave = spanA.max < spanB.min || spanB.max < spanA.min;
  const midAverage = (nodes.get("mid-a").x + nodes.get("mid-b").x) / 2;
  const aLeafAverage = (nodes.get("leaf-a-1").x + nodes.get("leaf-a-2").x) / 2;
  const bLeafAverage = (nodes.get("leaf-b-1").x + nodes.get("leaf-b-2").x) / 2;
  const midSeparation = Math.abs(nodes.get("mid-a").gridX - nodes.get("mid-b").gridX);

  expect(branchesDoNotInterleave).toBe(true);
  expect(Math.abs(nodes.get("effect").x - midAverage)).toBeLessThan(2);
  expect(Math.abs(nodes.get("mid-a").x - aLeafAverage)).toBeLessThan(2);
  expect(Math.abs(nodes.get("mid-b").x - bLeafAverage)).toBeLessThan(2);
  expect(midSeparation).toBeLessThanOrEqual(2.25);
});

test("CRT loops are explicit warnings and do not break tree layout", async ({ page }) => {
  await loadApp(page);
  const graph = await callApi(page, "sample", "crt-project");
  graph.edges.push({
    id: "edge-loop-feedback",
    from: "ude_self_hatred",
    to: "root_no_plan"
  });

  const payload = await callApi(page, "loadGraph", graph);
  const cycleInfo = await callApi(page, "crtCycleInfo");

  expect(cycleInfo.edgeIds).toContain("edge-loop-feedback");
  expect(cycleInfo.nodeIds).toContain("ude_self_hatred");
  expect(cycleInfo.feedbackEdgeIds.length).toBeGreaterThan(0);
  expect(payload.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true);
  await expect(page.locator("path.edge.loop-warning:not(.edge-hit)")).not.toHaveCount(0);
  await expect(page.locator(".node.crt.loop-warning")).not.toHaveCount(0);
});
