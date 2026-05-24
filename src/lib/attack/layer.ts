// Navigator-layer parser and gradient helpers for the ATT&CK 3D Explorer.
//
// Parses the subset of the MITRE ATT&CK Navigator layer schema (v4.x) the
// explorer actually uses: domain, versions, name/description, gradient, and
// per-technique score / color / comment / enabled. Other fields are ignored
// (and not preserved through re-export — see the spec's "Out of Scope").

// --- Public types ----------------------------------------------------------

export interface NavigatorGradient {
  /** Hex color stops, two or more. */
  colors: string[];
  /** Score corresponding to colors[0]. */
  minValue: number;
  /** Score corresponding to colors[colors.length - 1]. */
  maxValue: number;
}

export interface NavigatorTechnique {
  techniqueID: string;
  tactic?: string;
  score?: number;
  /** Explicit hex color — overrides the gradient for this technique. */
  color?: string;
  comment?: string;
  /** Defaults to true if the source layer omitted it. */
  enabled: boolean;
}

export interface NavigatorLayer {
  versions: { attack: string; navigator: string; layer: string };
  domain: string;
  name?: string;
  description?: string;
  gradient?: NavigatorGradient;
  techniques: NavigatorTechnique[];
}

export interface ParseResult {
  /** Null when there were hard errors. */
  layer: NavigatorLayer | null;
  /** Hard problems — import is blocked. */
  errors: string[];
  /** Soft problems — import proceeds. Surfaced as a subline in the sidebar. */
  warnings: string[];
}

// --- Constants -------------------------------------------------------------

/**
 * Used when a layer lacks a `gradient` field but has scored techniques.
 * Mirrors the canonical Navigator default (white-to-red, 0–100).
 */
export const DEFAULT_GRADIENT: NavigatorGradient = {
  colors: ['#ffffff', '#ff6666'],
  minValue: 0,
  maxValue: 100,
};

/**
 * Color painted on technique nodes that match the active filters but are NOT
 * present in the imported layer (so the user can see them as "uncovered").
 * Dim gray so coverage-present nodes pop.
 */
export const NEUTRAL_NOT_IN_LAYER = '#3a3a3a';

/**
 * The ATT&CK version this build of the explorer targets.
 * Used to emit a soft warning when an imported layer was built against a
 * different version, since technique IDs may differ.
 */
const CURRENT_ATTACK_VERSION = '17';

// --- Parser ----------------------------------------------------------------

/**
 * Parse and validate a Navigator layer JSON value (as produced by
 * `JSON.parse`). Hard errors block import; soft warnings let it proceed.
 *
 * @param json               The raw parsed JSON value (unknown shape).
 * @param graphTechniqueIds  Technique IDs present in the current graph.
 *                           Used to flag IDs in the layer that the explorer
 *                           cannot render.
 */
export function parseNavigatorLayer(
  json: unknown,
  graphTechniqueIds: Set<string>,
): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Shape gate: must be a plain object, not null and not an array.
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    errors.push('Layer file is not a JSON object.');
    return { layer: null, errors, warnings };
  }
  const raw = json as Record<string, unknown>;

  // Domain gate: enterprise-attack only.
  if (raw.domain !== 'enterprise-attack') {
    errors.push(
      `Layer domain is "${String(raw.domain)}"; only "enterprise-attack" is supported.`,
    );
    return { layer: null, errors, warnings };
  }

  // versions gate.
  if (typeof raw.versions !== 'object' || raw.versions === null) {
    errors.push('Layer is missing the "versions" object.');
    return { layer: null, errors, warnings };
  }
  const versions = raw.versions as Record<string, unknown>;

  // techniques gate.
  if (!Array.isArray(raw.techniques)) {
    errors.push('Layer is missing a "techniques" array.');
    return { layer: null, errors, warnings };
  }

  // Normalize each technique entry. An entry is kept if it has a score, an
  // explicit color, OR explicitly sets enabled: false — all three cases carry
  // render-relevant information. Entries with none of these are skipped.
  // Unknown IDs (not in graphTechniqueIds) are collected into a single warning.
  let unknownIdCount = 0;
  const techniques: NavigatorTechnique[] = [];
  for (const t of raw.techniques as unknown[]) {
    if (typeof t !== 'object' || t === null) continue;
    const entry = t as Record<string, unknown>;
    const techniqueID = typeof entry.techniqueID === 'string' ? entry.techniqueID : null;
    if (!techniqueID) continue;

    const score = typeof entry.score === 'number' ? entry.score : undefined;
    const color = typeof entry.color === 'string' ? entry.color : undefined;
    const enabledExplicit = entry.enabled === false;

    // Skip entries that carry no render-relevant data at all.
    if (score === undefined && color === undefined && !enabledExplicit) continue;

    if (!graphTechniqueIds.has(techniqueID)) {
      unknownIdCount += 1;
      // Still include the entry — the layer is preserved verbatim for
      // round-tripping; the byTechniqueId index built later filters unknowns.
    }

    techniques.push({
      techniqueID,
      tactic: typeof entry.tactic === 'string' ? entry.tactic : undefined,
      score,
      color,
      comment: typeof entry.comment === 'string' ? entry.comment : undefined,
      // enabled defaults to true when the field is absent or truthy.
      enabled: enabledExplicit ? false : true,
    });
  }

  if (unknownIdCount > 0) {
    warnings.push(
      `${unknownIdCount} technique ID${unknownIdCount === 1 ? '' : 's'} in the layer ` +
      `are not present in the current ATT&CK graph and were skipped.`,
    );
  }

  // Soft warning when the layer's ATT&CK version differs from this build.
  // A version mismatch means technique IDs in the layer may not match the
  // graph, so the user should verify coverage results manually.
  const layerAttack = typeof versions.attack === 'string' ? versions.attack : '';
  if (layerAttack !== '' && layerAttack !== CURRENT_ATTACK_VERSION) {
    warnings.push(
      `Layer ATT&CK version "${layerAttack}" differs from the current graph version ` +
      `"${CURRENT_ATTACK_VERSION}". Technique IDs may not match — verify coverage results.`,
    );
  }

  // Build the layer object.
  const layer: NavigatorLayer = {
    versions: {
      attack: layerAttack,
      navigator: typeof versions.navigator === 'string' ? versions.navigator : '',
      layer: typeof versions.layer === 'string' ? versions.layer : '',
    },
    domain: 'enterprise-attack',
    name: typeof raw.name === 'string' ? raw.name : undefined,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    gradient: parseGradient(raw.gradient),
    techniques,
  };

  return { layer, errors, warnings };
}

/** Parse and validate a gradient object from the raw layer JSON. */
function parseGradient(raw: unknown): NavigatorGradient | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const g = raw as Record<string, unknown>;
  if (!Array.isArray(g.colors) || g.colors.length === 0) return undefined;
  const colors = (g.colors as unknown[]).filter((c): c is string => typeof c === 'string');
  if (colors.length === 0) return undefined;
  const minValue = typeof g.minValue === 'number' ? g.minValue : 0;
  const maxValue = typeof g.maxValue === 'number' ? g.maxValue : 100;
  return { colors, minValue, maxValue };
}

// --- Color interpolation ---------------------------------------------------

/**
 * Resolve a score to a hex color along the gradient's stops. Clamps scores
 * outside [minValue, maxValue] to the endpoints. With one stop, returns it.
 *
 * For an N-stop gradient the range [minValue, maxValue] is divided into N-1
 * equal segments; the score is mapped into the appropriate segment and then
 * linearly interpolated between the two bounding stops.
 *
 * Degenerate (zero-width) range: when minValue === maxValue the clamp guards
 * fire before the division `(score - minValue) / (maxValue - minValue)` is
 * reached, so a NaN result is impossible for any finite score. Any score <=
 * minValue returns colors[0] and any score > minValue (i.e. above maxValue)
 * returns colors[colors.length - 1]. In practice all scores collapse to the
 * clamped endpoints, which is a safe and deterministic outcome.
 */
export function colorForScore(score: number, gradient: NavigatorGradient): string {
  const { colors, minValue, maxValue } = gradient;
  if (colors.length === 1) return colors[0];

  // Clamp to the endpoints. These guards also make degenerate (min === max)
  // ranges safe: the `<=` check always fires first for score === min === max,
  // and no score can be strictly between two equal bounds.
  if (score <= minValue) return colors[0];
  if (score >= maxValue) return colors[colors.length - 1];

  // Normalized position in [0, 1] across the full gradient range.
  const t = (score - minValue) / (maxValue - minValue);

  // Which segment between adjacent stops does this position fall in?
  const segments = colors.length - 1;
  const seg = Math.min(Math.floor(t * segments), segments - 1);

  // Local t within this segment, in [0, 1).
  const segT = t * segments - seg;

  return mixHex(colors[seg], colors[seg + 1], segT);
}

/**
 * Linearly interpolate between two #rrggbb hex color strings.
 * t=0 returns a, t=1 returns b.
 *
 * IMPORTANT: Both `a` and `b` MUST be exactly 7-character `#rrggbb` strings
 * (lowercase or uppercase, each channel two hex digits). The Navigator-layer
 * spec and this codebase use that convention for gradient color stops.
 *
 * Shorter forms like CSS 3-char shorthand (#f00) will produce incorrect
 * channel values because `slice(1,3)` will not capture the intended digits.
 * 8-char RGBA strings (#rrggbbaa) will silently ignore the alpha channel (the
 * alpha bytes are never sliced), so only the RGB portion is interpolated.
 *
 * If Navigator ever emits non-#rrggbb stops, add a normalization step here
 * before calling parseInt on the channel slices.
 */
function mixHex(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return '#' + toHex2(r) + toHex2(g) + toHex2(bl);
}

/** Format an integer 0–255 as a two-digit lowercase hex string. */
function toHex2(n: number): string {
  return n.toString(16).padStart(2, '0');
}
