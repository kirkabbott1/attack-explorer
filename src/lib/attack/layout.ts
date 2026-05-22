import type { GraphData, Vec3 } from './types';

// Layout constants in world units (Three.js default).
// Y-axis: positive is up. Z-axis: positive is toward the camera (out of the screen).
// Tactics sit at the top row (highest Y), techniques below them, then sub-techniques
// slightly behind in Z. Groups and software float in back planes at increasing Z depth.
const TACTIC_Y = 60;
const TACTIC_X_SPREAD = 180;
const TECHNIQUE_Y_TOP = 40;
const TECHNIQUE_Y_BOTTOM = -50;
const TECHNIQUE_Z_JITTER = 8;
const SUBTECHNIQUE_Z_OFFSET = 4;   // how far behind parent a sub-technique sits
const GROUP_Z = 40;
const GROUP_Y_TOP = 40;
const GROUP_Y_BOTTOM = -30;
const GROUP_X_SPREAD = 200;
const SOFTWARE_Z = 70;             // farther back than GROUP_Z
const SOFTWARE_Y_TOP = 30;
const SOFTWARE_Y_BOTTOM = -40;
const SOFTWARE_X_SPREAD = 220;

/**
 * Deterministic FNV-1a 32-bit hash normalized to [0, 1).
 * Used to produce stable "jitter" from node IDs instead of Math.random(),
 * so the layout is identical on every call with the same input.
 */
function hash01(s: string): number {
  // FNV-1a: XOR each byte into the accumulator then multiply by the FNV prime.
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Convert unsigned 32-bit integer to [0, 1).
  return (h >>> 0) / 0xffffffff;
}

/**
 * Compute deterministic 3D positions for every node in the graph.
 *
 * Layout strategy:
 *  - Tactics    : horizontal row at TACTIC_Y, evenly spaced on X by kill-chain order.
 *  - Techniques : vertical column below their primary tactic; X is near the tactic X
 *                 with a small hash-derived jitter to avoid perfect overlap.
 *  - Sub-techniques: inherit parent X/Y with small hash jitter, placed at parentZ - offset.
 *  - Groups     : scattered across the GROUP_Z back plane via hash-derived X/Y.
 *  - Software   : scattered across the SOFTWARE_Z plane (deeper still) via hash-derived X/Y.
 *
 * Deterministic guarantee: every position is derived only from node ID strings and the
 * graph structure — no random state. Same input always produces identical output.
 *
 * @param graph - Parsed GraphData (tactics, techniques, groups, software).
 * @returns Map from node ID to Vec3 world position.
 */
export function computeLayout(graph: GraphData): Map<string, Vec3> {
  const positions = new Map<string, Vec3>();

  // --- Tactics: sorted by kill-chain order, evenly spaced on X at top row ---
  const sortedTactics = [...graph.tactics].sort((a, b) => a.order - b.order);
  const tacticCount = sortedTactics.length;
  for (let i = 0; i < tacticCount; i++) {
    const t = sortedTactics[i];
    // If only one tactic, center it at x=0; otherwise distribute evenly across TACTIC_X_SPREAD.
    const x = tacticCount === 1
      ? 0
      : -TACTIC_X_SPREAD / 2 + (i / (tacticCount - 1)) * TACTIC_X_SPREAD;
    positions.set(t.id, { x, y: TACTIC_Y, z: 0 });
  }

  // --- Techniques: group by primary tactic, stack vertically below tactic column ---
  // Build a map from tactic ID -> list of non-sub-techniques that belong to it.
  const techniquesByTactic = new Map<string, typeof graph.techniques>();
  for (const tech of graph.techniques) {
    if (tech.isSubtechnique) continue;             // sub-techniques handled separately
    const primaryTacticId = tech.tacticIds[0];    // use first listed tactic as primary
    const arr = techniquesByTactic.get(primaryTacticId) ?? [];
    arr.push(tech);
    techniquesByTactic.set(primaryTacticId, arr);
  }

  for (const [tacticId, techniques] of techniquesByTactic) {
    const tacticPos = positions.get(tacticId);
    if (!tacticPos) continue;
    const count = techniques.length;
    for (let i = 0; i < count; i++) {
      const tech = techniques[i];
      // t: 0 = first technique (near top), 1 = last (near bottom of column).
      const t = count === 1 ? 0.5 : i / (count - 1);
      const y = TECHNIQUE_Y_TOP - t * (TECHNIQUE_Y_TOP - TECHNIQUE_Y_BOTTOM);
      // Small X jitter to avoid exact column overlap when multiple tactics share techniques.
      const jx = (hash01(tech.id) - 0.5) * 12;
      // Small Z jitter to give depth variation within a tactic's technique column.
      const jz = (hash01(tech.id + 'z') - 0.5) * TECHNIQUE_Z_JITTER * 2;
      positions.set(tech.id, { x: tacticPos.x + jx, y, z: jz });
    }
  }

  // --- Sub-techniques: placed behind (smaller Z) their parent technique ---
  for (const tech of graph.techniques) {
    if (!tech.isSubtechnique || !tech.parentId) continue;
    const parentPos = positions.get(tech.parentId);
    if (!parentPos) continue;
    // Small X/Y jitter keeps sub-techniques visually distinct from their parent
    // while staying obviously clustered near it.
    const jx = (hash01(tech.id) - 0.5) * 6;
    const jy = (hash01(tech.id + 'y') - 0.5) * 6;
    positions.set(tech.id, {
      x: parentPos.x + jx,
      y: parentPos.y + jy,
      z: parentPos.z - SUBTECHNIQUE_Z_OFFSET,   // strictly behind parent
    });
  }

  // --- Groups: back plane at GROUP_Z, spread across X/Y by hash ---
  // Using hash01 rather than sorted indices keeps the position stable even
  // when the groups array changes order between ATT&CK version updates.
  for (const g of graph.groups) {
    const x = (hash01(g.id) - 0.5) * GROUP_X_SPREAD;
    const y = GROUP_Y_TOP - hash01(g.id + 'y') * (GROUP_Y_TOP - GROUP_Y_BOTTOM);
    positions.set(g.id, { x, y, z: GROUP_Z });
  }

  // --- Software: deeper back plane at SOFTWARE_Z, spread across X/Y by hash ---
  for (const s of graph.software) {
    const x = (hash01(s.id) - 0.5) * SOFTWARE_X_SPREAD;
    const y = SOFTWARE_Y_TOP - hash01(s.id + 'y') * (SOFTWARE_Y_TOP - SOFTWARE_Y_BOTTOM);
    positions.set(s.id, { x, y, z: SOFTWARE_Z });
  }

  return positions;
}
