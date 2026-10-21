import { VISUALLY_HIDDEN } from '../../lib/visuallyHidden';

/** The page year shown in a section's header, so every section that follows it says which year it is showing.
 * The word "Year" is visually hidden text, not an `aria-label`: ARIA prohibits naming a role-less `span`, so screen
 * readers ignored the label and announced a bare number. */
export function YearBadge({ year }: { year: number }) {
  return (
    <span
      className="syn-text-lg"
      style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 3, fontVariantNumeric: 'tabular-nums', background: 'var(--syn-color-surface-overlay, rgba(127,127,127,0.18))', color: 'var(--syn-color-text-secondary)' }}
    >
      {/* Leading space: every call site puts the badge straight after heading text ("By Country<YearBadge/>"),
          so without it the accessible name ran together as "By CountryYear 2024". */}
      <span style={VISUALLY_HIDDEN}>{' Year '}</span>
      {year}
    </span>
  );
}
