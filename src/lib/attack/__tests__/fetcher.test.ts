// Unit tests for the pure helpers in src/lib/attack/fetcher.ts.
// These run under Jest (jsdom) without any network access.

import {
  stripCitations,
  truncateForSearch,
  deriveDataComponentId,
  buildMitigationRelationships,
  buildDetectionRelationships,
} from '../fetcher';

describe('lib/attack/fetcher: stripCitations', () => {
  test('removes a single (Citation: X) marker', () => {
    expect(stripCitations('PowerShell is widely used. (Citation: Microsoft 2024)'))
      .toBe('PowerShell is widely used.');
  });

  test('removes multiple citation markers', () => {
    expect(stripCitations('Foo (Citation: A) bar (Citation: B) baz.'))
      .toBe('Foo bar baz.');
  });

  test('collapses internal whitespace from stripping', () => {
    expect(stripCitations('A  (Citation: X)  B')).toBe('A B');
  });

  test('preserves text with no citations untouched (trimmed)', () => {
    expect(stripCitations('Plain text with no markers.'))
      .toBe('Plain text with no markers.');
  });

  test('handles empty input', () => {
    expect(stripCitations('')).toBe('');
  });
});

describe('lib/attack/fetcher: truncateForSearch', () => {
  test('returns short input unchanged', () => {
    expect(truncateForSearch('Short text.')).toBe('Short text.');
  });

  test('strips citations before measuring length', () => {
    const raw = 'PowerShell is everywhere. (Citation: A)(Citation: B)';
    expect(truncateForSearch(raw)).toBe('PowerShell is everywhere.');
  });

  test('truncates at a word boundary for long input', () => {
    // Build a deterministic long string of repeated 10-char words.
    const word = 'abcdefghi '; // 10 chars including trailing space
    const long = word.repeat(50).trim(); // ~500 chars
    const result = truncateForSearch(long);
    expect(result.length).toBeLessThanOrEqual(200);
    // Must not end mid-word: the result should end at a complete word.
    expect(result.endsWith('abcdefghi')).toBe(true);
  });

  test('hard-cuts at 200 chars when no late-enough space exists', () => {
    // 300-char run of non-space characters: no word boundary within the
    // upper half of the truncation window, so we fall back to a hard cut.
    const noSpaces = 'x'.repeat(300);
    const result = truncateForSearch(noSpaces);
    expect(result).toHaveLength(200);
  });
});

describe('lib/attack/fetcher: deriveDataComponentId', () => {
  test('prefers the STIX external_id when present', () => {
    const obj = {
      type: 'x-mitre-data-component',
      id: 'x-mitre-data-component--abc',
      name: 'Process Creation',
      external_references: [{ source_name: 'mitre-attack', external_id: 'DC0001' }],
    };
    expect(deriveDataComponentId(obj as any, 'DS0009')).toBe('DC0001');
  });

  test('falls back to slug derived from parent data source + component name', () => {
    const obj = {
      type: 'x-mitre-data-component',
      id: 'x-mitre-data-component--abc',
      name: 'Process Creation',
    };
    expect(deriveDataComponentId(obj as any, 'DS0009')).toBe('DS0009-process-creation');
  });

  test('slug lowercases and replaces spaces and slashes', () => {
    const obj = {
      type: 'x-mitre-data-component',
      id: 'x-mitre-data-component--xyz',
      name: 'OS API Execution / Hook',
    };
    expect(deriveDataComponentId(obj as any, 'DS0011'))
      .toBe('DS0011-os-api-execution-hook');
  });

  test('strips any character that is not [a-z0-9-]', () => {
    const obj = {
      type: 'x-mitre-data-component',
      id: 'x-mitre-data-component--zzz',
      name: 'Network "Connection" Creation!',
    };
    expect(deriveDataComponentId(obj as any, 'DS0029'))
      .toBe('DS0029-network-connection-creation');
  });
});

describe('lib/attack/fetcher: buildMitigationRelationships', () => {
  // STIX UUIDs are arbitrary but must match between objects and relationships.
  const mitigationStixId = 'course-of-action--m1';
  const technique1StixId = 'attack-pattern--t1';
  const technique2StixId = 'attack-pattern--t2';

  // Map from STIX UUID to ATT&CK ID -- built by the fetcher's existing
  // stixIdToAttackId pass; here we pre-build it for the test.
  const stixIdToAttackId = new Map([
    [mitigationStixId, 'M1041'],
    [technique1StixId, 'T1566'],
    [technique2StixId, 'T1566.001'],
  ]);

  const relationships: any[] = [
    {
      type: 'relationship',
      relationship_type: 'mitigates',
      source_ref: mitigationStixId,
      target_ref: technique1StixId,
    },
    {
      type: 'relationship',
      relationship_type: 'mitigates',
      source_ref: mitigationStixId,
      target_ref: technique2StixId,
    },
    // A 'uses' relationship should be ignored by this builder.
    {
      type: 'relationship',
      relationship_type: 'uses',
      source_ref: 'intrusion-set--g1',
      target_ref: technique1StixId,
    },
  ];

  test('builds techniqueId -> mitigationIds map', () => {
    const { mitigationIdsByTechnique } = buildMitigationRelationships(relationships, stixIdToAttackId);
    expect(mitigationIdsByTechnique.get('T1566')).toEqual(['M1041']);
    expect(mitigationIdsByTechnique.get('T1566.001')).toEqual(['M1041']);
  });

  test('builds reverse mitigationId -> techniqueIds map', () => {
    const { techniqueIdsByMitigation } = buildMitigationRelationships(relationships, stixIdToAttackId);
    expect(techniqueIdsByMitigation.get('M1041')?.sort()).toEqual(['T1566', 'T1566.001']);
  });

  test('ignores relationships whose source or target ID is unknown', () => {
    const orphan: any[] = [
      {
        type: 'relationship',
        relationship_type: 'mitigates',
        source_ref: 'course-of-action--unknown',
        target_ref: technique1StixId,
      },
    ];
    const { mitigationIdsByTechnique } = buildMitigationRelationships(orphan, stixIdToAttackId);
    expect(mitigationIdsByTechnique.size).toBe(0);
  });
});

describe('lib/attack/fetcher: buildDetectionRelationships', () => {
  const componentStixId = 'x-mitre-data-component--c1';
  const techniqueStixId = 'attack-pattern--t1';

  // For detections the relationship source uses the STIX UUID of the
  // data component, NOT the data component's ATT&CK ID. The caller
  // resolves the UUID to our (possibly synthetic) data component ID.
  const stixIdToDataComponentId = new Map([
    [componentStixId, 'DS0009-process-creation'],
  ]);
  const stixIdToAttackId = new Map([
    [techniqueStixId, 'T1059'],
  ]);

  const relationships: any[] = [
    {
      type: 'relationship',
      relationship_type: 'detects',
      source_ref: componentStixId,
      target_ref: techniqueStixId,
    },
    // 'uses' should be ignored.
    {
      type: 'relationship',
      relationship_type: 'uses',
      source_ref: 'intrusion-set--g1',
      target_ref: techniqueStixId,
    },
  ];

  test('builds techniqueId -> dataComponentIds map', () => {
    const { dataComponentIdsByTechnique } = buildDetectionRelationships(
      relationships,
      stixIdToDataComponentId,
      stixIdToAttackId,
    );
    expect(dataComponentIdsByTechnique.get('T1059')).toEqual(['DS0009-process-creation']);
  });

  test('builds reverse dataComponentId -> techniqueIds map', () => {
    const { techniqueIdsByDataComponent } = buildDetectionRelationships(
      relationships,
      stixIdToDataComponentId,
      stixIdToAttackId,
    );
    expect(techniqueIdsByDataComponent.get('DS0009-process-creation')).toEqual(['T1059']);
  });

  test('skips relationships whose source data component is unknown', () => {
    const orphan: any[] = [
      {
        type: 'relationship',
        relationship_type: 'detects',
        source_ref: 'x-mitre-data-component--unknown',
        target_ref: techniqueStixId,
      },
    ];
    const { dataComponentIdsByTechnique } = buildDetectionRelationships(
      orphan,
      stixIdToDataComponentId,
      stixIdToAttackId,
    );
    expect(dataComponentIdsByTechnique.size).toBe(0);
  });
});
