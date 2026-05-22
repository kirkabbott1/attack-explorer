import fs from 'fs';
import path from 'path';
import { computeLayout } from '../layout';
import type { GraphData } from '../types';

// Load the mini fixture with 3 tactics, 5 techniques (2 subs), 2 groups, 2 software = 12 nodes.
const fixturePath = path.join(__dirname, 'fixtures', 'mini-graph.json');
const fixture: GraphData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

describe('lib/attack/layout', () => {
  // Every node in the fixture should receive a Vec3 position.
  test('returns a position for every node (tactic, technique, group, software)', () => {
    const positions = computeLayout(fixture);
    expect(positions.size).toBe(12);
    expect(positions.has('TA0001')).toBe(true);
    expect(positions.has('T1059.001')).toBe(true);
    expect(positions.has('G0016')).toBe(true);
    expect(positions.has('S0001')).toBe(true);
  });

  // Tactics form a horizontal row: same Y for all, distinct X values spread across the axis.
  test('tactics are arranged along positive Y (top) and span the X axis', () => {
    const positions = computeLayout(fixture);
    const tacticPositions = fixture.tactics.map(t => positions.get(t.id)!);
    const ys = tacticPositions.map(p => p.y);
    expect(new Set(ys).size).toBe(1);
    const xs = tacticPositions.map(p => p.x);
    expect(new Set(xs).size).toBe(3);
  });

  // Techniques must be below (smaller Y) than their parent tactic.
  test('techniques sit below their parent tactic in Y', () => {
    const positions = computeLayout(fixture);
    const tacticY = positions.get('TA0001')!.y;
    const techniqueY = positions.get('T1566')!.y;
    expect(techniqueY).toBeLessThan(tacticY);
  });

  // Sub-techniques are placed slightly behind (smaller Z) their parent technique.
  test('sub-techniques sit behind (smaller Z) their parent technique', () => {
    const positions = computeLayout(fixture);
    const parentZ = positions.get('T1566')!.z;
    const subZ = positions.get('T1566.001')!.z;
    expect(subZ).toBeLessThan(parentZ);
  });

  // Groups occupy the back plane — their Z should exceed any technique's Z.
  test('groups float in the back plane (large +Z)', () => {
    const positions = computeLayout(fixture);
    const groupZ = positions.get('G0016')!.z;
    const techniqueZ = positions.get('T1566')!.z;
    expect(groupZ).toBeGreaterThan(techniqueZ);
  });

  // Software is placed even farther back than groups.
  test('software floats farther back than groups', () => {
    const positions = computeLayout(fixture);
    const softwareZ = positions.get('S0001')!.z;
    const groupZ = positions.get('G0016')!.z;
    expect(softwareZ).toBeGreaterThan(groupZ);
  });

  // The layout must be deterministic: calling computeLayout twice with the same
  // input should produce identical positions (no Math.random usage).
  test('layout is deterministic — same input produces same positions', () => {
    const a = computeLayout(fixture);
    const b = computeLayout(fixture);
    for (const [id, posA] of a) {
      const posB = b.get(id)!;
      expect(posB.x).toBeCloseTo(posA.x);
      expect(posB.y).toBeCloseTo(posA.y);
      expect(posB.z).toBeCloseTo(posA.z);
    }
  });
});
