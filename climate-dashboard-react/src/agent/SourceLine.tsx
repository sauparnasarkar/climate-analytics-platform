/** The "Source: ..." line under a chart (every chart states its source and scope, in 12px muted type). The text is the agent's
 * deterministic `source_line`, built from the tool result: coverage years, and whether land use is included. */
export function SourceLine({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <p className="syn-caption" style={{ margin: '6px 0 0', color: 'var(--syn-color-text-muted)' }}>
      {text}
    </p>
  );
}

/** The scenario answer's warning chip ("Illustrative · implied outcomes, not climate-model projections"): mono caps in the theme-aware amber the
 * module's own "illustrative" chips use (`--area2-warning`), on a faint tint of the same colour. */
export function ScenarioBadge({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <span
      style={{
        display: 'inline-block',
        alignSelf: 'flex-start',
        fontFamily: 'var(--syn-family-ui)',
        fontSize: 11,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        color: 'var(--area2-warning, inherit)',
        background: 'color-mix(in srgb, var(--area2-warning, currentColor) 12%, transparent)',
        borderRadius: 3,
        padding: '3px 8px',
        margin: '0 0 8px',
      }}
    >
      {text}
    </span>
  );
}
