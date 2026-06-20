function pfdCriticalPathGraph() {
  return {
    diagramType: "pfd",
    viewMode: "detail",
    nodes: [
      { id: "a0", type: "artifact", text: "request", gridX: 0, gridY: 0 },
      { id: "p1", type: "process", text: "design", estimate: "3d", statuses: ["done"], gridX: 1, gridY: 0 },
      { id: "a1", type: "artifact", text: "design doc", gridX: 2, gridY: 0 },
      { id: "p2", type: "process", text: "build", estimate: "4d", gridX: 3, gridY: 0 },
      { id: "a2", type: "artifact", text: "release", gridX: 4, gridY: 0 },
      { id: "p3", type: "process", text: "shortcut", estimate: "2d", gridX: 1, gridY: 1 },
      { id: "a3", type: "artifact", text: "shortcut output", gridX: 2, gridY: 1 }
    ],
    edges: [
      { id: "e1", from: "a0", to: "p1" },
      { id: "e2", from: "p1", to: "a1" },
      { id: "e3", from: "a1", to: "p2" },
      { id: "e4", from: "p2", to: "a2" },
      { id: "e5", from: "a0", to: "p3" },
      { id: "e6", from: "p3", to: "a3" }
    ]
  };
}

function ccpmSimpleGraph(overrides = {}) {
  const nodeOverrides = overrides.nodeOverrides || {};
  const baseNodes = [
    { id: "t1", type: "ccpm", text: "plan", estimate: "2d", owner: "Akira", statuses: [], gridX: 0, gridY: 0 },
    { id: "t2", type: "ccpm", text: "build", estimate: "3d", owner: "Mika", statuses: [], gridX: 1, gridY: 0 },
    { id: "t3", type: "ccpm", text: "review", estimate: "1d", owner: "Sato", statuses: [], gridX: 2, gridY: 0 }
  ].map(node => ({ ...node, ...(nodeOverrides[node.id] || {}) }));

  return {
    diagramType: "ccpm",
    viewMode: "detail",
    project: {
      start: "2026-05-11",
      end: "2026-05-29",
      today: "2026-05-11",
      holidays: ["2026-05-18"],
      resources: ["Akira", "Mika", "Sato"],
      baseline: null,
      ...(overrides.project || {})
    },
    nodes: baseNodes.concat(overrides.nodes || []),
    edges: [
      { id: "e1", from: "t1", to: "t2" },
      { id: "e2", from: "t2", to: "t3" },
      ...(overrides.edges || [])
    ]
  };
}

function ccpmResourceGraph(resources = ["Akira"]) {
  return {
    diagramType: "ccpm",
    project: {
      start: "2026-05-11",
      end: "2026-05-29",
      today: "2026-05-11",
      holidays: [],
      resources,
      baseline: null
    },
    nodes: [
      { id: "a", type: "ccpm", text: "A", estimate: "4d", owner: "Akira", statuses: [], gridX: 0, gridY: 0 },
      { id: "b", type: "ccpm", text: "B", estimate: "3d", owner: "Akira", statuses: [], gridX: 0, gridY: 1 },
      { id: "a2", type: "ccpm", text: "A2", estimate: "4d", owner: "Mika", statuses: [], gridX: 1, gridY: 0 },
      { id: "b2", type: "ccpm", text: "B2", estimate: "6d", owner: "Sato", statuses: [], gridX: 1, gridY: 1 }
    ],
    edges: [
      { id: "ea", from: "a", to: "a2" },
      { id: "eb", from: "b", to: "b2" }
    ]
  };
}

function goalNaviGraph(overrides = {}) {
  return {
    diagramType: "goal",
    project: {
      start: "2026-05-01",
      end: "2026-05-29",
      holidays: ["2026-05-04"],
      ...(overrides.project || {})
    },
    targetRatio: overrides.targetRatio ?? 0.6,
    phases: overrides.phases || [
      { id: "phase-1", name: "Phase 1", plannedDays: 10 },
      { id: "phase-2", name: "Phase 2", plannedDays: 10 }
    ],
    records: overrides.records || [
      {
        id: "r1",
        date: "2026-05-01",
        phases: {
          "phase-1": { remainingPlanDays: 10, totalEstimate: 0, doneEstimate: 0 },
          "phase-2": { remainingPlanDays: 10, totalEstimate: 0, doneEstimate: 0 }
        }
      },
      {
        id: "r2",
        date: "2026-05-08",
        phases: {
          "phase-1": { remainingPlanDays: 6, totalEstimate: 4, doneEstimate: 2 },
          "phase-2": { remainingPlanDays: 10, totalEstimate: 0, doneEstimate: 0 }
        }
      },
      {
        id: "r3",
        date: "2026-05-15",
        velocityOverride: 2,
        phases: {
          "phase-1": { remainingPlanDays: 2, totalEstimate: 8, doneEstimate: 6 },
          "phase-2": { remainingPlanDays: 8, totalEstimate: 2, doneEstimate: 0 }
        }
      }
    ]
  };
}

module.exports = {
  pfdCriticalPathGraph,
  ccpmSimpleGraph,
  ccpmResourceGraph,
  goalNaviGraph
};
