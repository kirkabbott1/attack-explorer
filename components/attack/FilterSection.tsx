import { useState } from 'react';

// A single selectable option rendered as a chip button.
interface ChipOption {
  value: string;
  label: string;
}

// Props for a collapsible filter section with multi-select chip buttons.
interface FilterSectionProps {
  title: string;
  options: ChipOption[];
  // Currently selected values — parent owns the state via useFilters().
  selected: string[];
  // Callback invoked with the value that was clicked; parent toggles inclusion.
  onToggle: (value: string) => void;
}

/**
 * Collapsible section with multi-select chip buttons. Used for Platform and Tactic
 * sections. Groups and Software also use this component for consistency — the plan
 * mentions a searchable checklist for those in a later task but the current spec
 * uses chips uniformly.
 *
 * Internal collapse state is local to this component — each section can be
 * expanded/collapsed independently without polluting context.
 */
export default function FilterSection({ title, options, selected, onToggle }: FilterSectionProps) {
  // Track whether this section's body is hidden. Starts expanded (false = not collapsed).
  const [collapsed, setCollapsed] = useState(false);
  // Number of active selections shown in the heading badge.
  const activeCount = selected.length;

  return (
    // Section heading rendered as an h3 so it is picked up by getByRole('heading').
    // Border separates each section in the sidebar list.
    <div className="border-b border-darkteal/20 py-3 px-4">
      {/* Section heading rendered as an <h3> so getByRole('heading') matches. */}
      <h3 className="sr-only">{title}</h3>

      {/* Visible collapse-toggle button — labelled by the heading text. */}
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="flex w-full items-center justify-between text-sm font-semibold text-medteal hover:text-lightteal"
      >
        <span>
          <span className="uppercase tracking-wider">{title}</span>
          {/* Show count badge only when at least one chip is selected. */}
          {activeCount > 0 && (
            <span className="ml-2 text-lightteal/70">({activeCount})</span>
          )}
        </span>
        {/* Collapse indicator glyph — hidden from screen readers. */}
        <span aria-hidden="true">{collapsed ? '+' : '−'}</span>
      </button>

      {/* Chip grid — hidden when section is collapsed. */}
      {!collapsed && (
        <div className="mt-3 flex flex-wrap gap-1">
          {options.map(opt => {
            const isSelected = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                // aria-pressed communicates toggle state to assistive technology.
                aria-pressed={isSelected}
                onClick={() => onToggle(opt.value)}
                className={`px-2 py-1 text-xs rounded border transition-colors ${
                  isSelected
                    ? 'bg-medteal/30 text-medteal border-medteal'
                    : 'bg-darkblue/40 text-lightteal/70 border-darkteal/40 hover:border-medteal/60'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
