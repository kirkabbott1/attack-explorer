import fs from 'fs';
import path from 'path';
import {
  createDataLayer,
  type DataLayer,
} from '../data';
import type { GraphData } from '../types';

// Load the mini fixture that covers all relationship types tested below.
const fixturePath = path.join(__dirname, 'fixtures', 'mini-graph.json');
const fixture: GraphData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

describe('lib/attack/data', () => {
  // A fresh DataLayer is created before each test so tests are isolated.
  let dl: DataLayer;

  beforeEach(() => {
    dl = createDataLayer(fixture);
  });

  test('getTactic returns a tactic by id', () => {
    const t = dl.getTactic('TA0001');
    expect(t?.name).toBe('Initial Access');
    expect(dl.getTactic('does-not-exist')).toBeNull();
  });

  test('getTechnique returns a technique by id, including sub-techniques', () => {
    expect(dl.getTechnique('T1566')?.name).toBe('Phishing');
    expect(dl.getTechnique('T1566.001')?.isSubtechnique).toBe(true);
    expect(dl.getTechnique('T9999')).toBeNull();
  });

  test('getSubtechniquesOf returns children of a technique', () => {
    const subs = dl.getSubtechniquesOf('T1566');
    expect(subs).toHaveLength(1);
    expect(subs[0].id).toBe('T1566.001');
    // A technique with no sub-techniques returns an empty array.
    expect(dl.getSubtechniquesOf('T1098')).toEqual([]);
  });

  test('getGroupsUsingTechnique returns groups that reference the technique', () => {
    const groups = dl.getGroupsUsingTechnique('T1098');
    expect(groups.map(g => g.id).sort()).toEqual(['G0016', 'G0032']);
    // T1566 itself is not used directly; only its sub-technique is referenced.
    expect(dl.getGroupsUsingTechnique('T1566')).toEqual([]);
  });

  test('getSoftwareUsingTechnique returns software that reference the technique', () => {
    const sw = dl.getSoftwareUsingTechnique('T1059.001');
    expect(sw.map(s => s.id)).toEqual(['S0001']);
  });

  test('getTechniquesForGroup returns techniques referenced by a group', () => {
    const ts = dl.getTechniquesForGroup('G0016');
    expect(ts.map(t => t.id).sort()).toEqual(['T1059.001', 'T1098', 'T1566.001']);
  });

  test('getAllTactics, getAllTechniques, getAllGroups, getAllSoftware return full arrays', () => {
    expect(dl.getAllTactics()).toHaveLength(3);
    expect(dl.getAllTechniques()).toHaveLength(5);
    expect(dl.getAllGroups()).toHaveLength(2);
    expect(dl.getAllSoftware()).toHaveLength(2);
  });

  test('version is exposed', () => {
    expect(dl.version).toBe('test-1.0');
  });
});
