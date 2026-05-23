// DetailPanel renders the right-side info panel for whichever node is currently
// selected (focusId) in the ATT&CK 3D Explorer. Returns null when nothing is
// selected - the AppShell collapses the right column to 0 width in that case.
// useGraph provides O(1) data access; useSelection reads/writes the focus id.

import { useGraph, useSelection, useCoverage } from '@/lib/attack/context';

// Base URL for outbound links back to the live MITRE ATT&CK website.
const MITRE_BASE = 'https://attack.mitre.org';

/**
 * Right-side panel showing the selected node's info and relationships.
 * Returns null when nothing is selected; the AppShell collapses the right column to 0 width.
 */
export default function DetailPanel() {
  // Pull the DataLayer (all accessor methods) and the current selection from context.
  const data = useGraph();
  const [focusId, setSelection] = useSelection();
  // Read the imported Navigator layer state for displaying per-technique coverage data.
  const [coverage] = useCoverage();

  // Nothing selected - render nothing so AppShell can collapse the column.
  if (!focusId) return null;

  // Try to identify what kind of node is selected by checking each entity type.
  // Only one of these will be non-null for a given id.
  const tactic = data.getTactic(focusId);
  const technique = data.getTechnique(focusId);
  const group = data.getGroup(focusId);
  const software = data.getSoftware(focusId);

  // Convenience close handler - clears the selection to collapse the panel.
  const close = () => setSelection(null);

  // --- Technique panel ---
  if (technique) {
    // Look up the parent technique if this is a sub-technique (e.g., T1059.001 -> T1059).
    const parent = technique.parentId ? data.getTechnique(technique.parentId) : null;
    // Get all sub-techniques whose parentId matches this technique's id.
    const subs = data.getSubtechniquesOf(technique.id);
    // Get all groups that list this technique in their techniqueIds.
    const groups = data.getGroupsUsingTechnique(technique.id);
    // Get all software that list this technique in their techniqueIds.
    const sw = data.getSoftwareUsingTechnique(technique.id);

    // Build the MITRE URL path: sub-techniques use /<parentId>/<subtechniqueNumber>.
    // For example T1059.001 -> /techniques/T1059/001.
    const mitrePath = technique.isSubtechnique
      ? `/techniques/${technique.parentId}/${technique.id.split('.').pop()}`
      : `/techniques/${technique.id}`;

    return (
      <div className="p-4 text-sm">
        <Header id={technique.id} name={technique.name} kind="Technique" onClose={close} />
        <Field label="Platforms" value={technique.platforms.join(', ') || '—'} />
        {parent && <RelatedLinkSection title="Parent technique" items={[parent]} onPick={setSelection} />}
        {subs.length > 0 && <RelatedLinkSection title={`Sub-techniques (${subs.length})`} items={subs} onPick={setSelection} />}
        {groups.length > 0 && <RelatedLinkSection title={`Used by groups (${groups.length})`} items={groups} onPick={setSelection} />}
        {sw.length > 0 && <RelatedLinkSection title={`Implemented in software (${sw.length})`} items={sw} onPick={setSelection} />}
        <CoverageLayerInfo
          layerName={coverage.layer?.name ?? null}
          entry={coverage.byTechniqueId.get(technique.id) ?? null}
        />
        <MitreLink href={`${MITRE_BASE}${mitrePath}`} />
      </div>
    );
  }

  // --- Group panel ---
  if (group) {
    // Resolve each techniqueId listed in the group to full Technique objects.
    const techniques = data.getTechniquesForGroup(group.id);
    return (
      <div className="p-4 text-sm">
        <Header id={group.id} name={group.name} kind="Group" onClose={close} />
        {/* Only show aliases section when there are aliases beyond the primary name. */}
        {group.aliases.length > 1 && <Field label="Aliases" value={group.aliases.join(', ')} />}
        {techniques.length > 0 && <RelatedLinkSection title={`Techniques used (${techniques.length})`} items={techniques} onPick={setSelection} />}
        <MitreLink href={`${MITRE_BASE}/groups/${group.id}`} />
      </div>
    );
  }

  // --- Software panel (malware or tool) ---
  if (software) {
    const techniques = data.getTechniquesForSoftware(software.id);
    return (
      <div className="p-4 text-sm">
        <Header
          id={software.id}
          name={software.name}
          kind={software.type === 'malware' ? 'Malware' : 'Tool'}
          onClose={close}
        />
        {techniques.length > 0 && <RelatedLinkSection title={`Techniques (${techniques.length})`} items={techniques} onPick={setSelection} />}
        <MitreLink href={`${MITRE_BASE}/software/${software.id}`} />
      </div>
    );
  }

  // --- Tactic panel ---
  if (tactic) {
    return (
      <div className="p-4 text-sm">
        <Header id={tactic.id} name={tactic.name} kind="Tactic" onClose={close} />
        <MitreLink href={`${MITRE_BASE}/tactics/${tactic.id}`} />
      </div>
    );
  }

  // focusId set to an id that doesn't match any known node type - render nothing.
  return null;
}

// --- Sub-components ---

/**
 * Panel header: shows the entity kind label, display name, and id below it,
 * plus a close button (x) that clears the selection.
 */
function Header({
  id,
  name,
  kind,
  onClose,
}: {
  id: string;
  name: string;
  kind: string;
  onClose: () => void;
}) {
  return (
    <div className="flex justify-between items-start mb-3 pb-3 border-b border-darkteal/30">
      <div>
        {/* Kind label - small uppercase category tag above the name */}
        <div className="text-xs uppercase tracking-wider text-lightteal/50">{kind}</div>
        <h3 className="text-lg font-semibold text-lightteal">{name}</h3>
        {/* ATT&CK id below the name, muted so the name reads first */}
        <div className="text-xs text-lightteal/50">{id}</div>
      </div>
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="text-lightteal/60 hover:text-lightteal"
      >
        &times;
      </button>
    </div>
  );
}

/**
 * Single labeled text field - used for Platforms, Aliases, etc.
 */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2">
      <div className="text-xs uppercase tracking-wider text-lightteal/50">{label}</div>
      <div className="text-lightteal/90">{value}</div>
    </div>
  );
}

/**
 * A labeled list of clickable related items (techniques, groups, software).
 * Clicking an item calls onPick with its id to switch the panel to that node.
 * Generic over any object that has {id, name} so it can handle all entity types.
 */
function RelatedLinkSection<T extends { id: string; name: string }>({
  title,
  items,
  onPick,
}: {
  title: string;
  items: T[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="mb-4">
      {/* Section title with item count in parentheses */}
      <div className="text-xs uppercase tracking-wider text-lightteal/50 mb-1">{title}</div>
      <ul className="space-y-1">
        {items.map(item => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onPick(item.id)}
              className="text-medteal hover:text-lightteal text-left"
            >
              {item.name} <span className="text-lightteal/40">{item.id}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Outbound link to the live MITRE ATT&CK website entry for the selected node.
 * Opens in a new tab with rel="noopener noreferrer" for security.
 * The arrow character (→) is inserted via &rarr; to avoid encoding issues.
 */
function MitreLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block mt-4 text-xs text-medteal hover:text-lightteal"
    >
      Open on attack.mitre.org &rarr;
    </a>
  );
}

/**
 * Coverage-layer subsection: shows the imported layer's score and comment for
 * the focused technique. Renders nothing when no layer is loaded. Renders a
 * "not in this layer" line when a layer is loaded but the technique is absent.
 */
function CoverageLayerInfo({
  layerName,
  entry,
}: {
  layerName: string | null;
  entry: { score?: number; color?: string; comment?: string; enabled: boolean } | null;
}) {
  // No layer loaded - suppress the section entirely.
  if (layerName === null) return null;

  return (
    <div className="mt-4 pt-3 border-t border-darkteal/30">
      <div className="text-xs uppercase tracking-wider text-lightteal/50">
        Coverage layer
      </div>
      {/* Display the layer name below the section heading */}
      <div className="text-xs text-lightteal/50 mb-1">{layerName}</div>
      {entry === null ? (
        // Technique exists in the graph but is absent from the imported layer.
        <div className="text-sm text-lightteal/70">Not in this layer</div>
      ) : (
        <>
          {/* Show numeric score when the layer entry carries one */}
          {entry.score !== undefined && (
            <div className="text-sm text-lightteal/90">Score: {entry.score}</div>
          )}
          {/* Show analyst comment when present; whitespace-pre-line preserves line breaks */}
          {entry.comment && (
            <div className="text-sm text-lightteal/80 whitespace-pre-line">
              {entry.comment}
            </div>
          )}
        </>
      )}
    </div>
  );
}
