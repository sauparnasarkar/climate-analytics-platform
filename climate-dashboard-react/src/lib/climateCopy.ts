// Fixed copy for the Area 2 climate-context surfaces (requirements doc §2.3/§2.4, SPEC.md §5.26).
// One place, so the guardrail wording cannot drift between the landing page, the Overview and the
// Climate Correlation page. Figures never live here -- every number on screen comes from API output.

/** Overview anchors the Landing and the in-page jump links point at (one constant, so a link and its target cannot drift). */
export const CLIMATE_SIGNAL_ANCHOR = 'climate-signal';
export const RELATIONSHIP_ANCHOR = 'relationship';

export const CAUSAL_CHAIN = ['Emissions', 'Concentration', 'Radiative forcing', 'Temperature anomaly'] as const;

/** Radiative forcing is copy-only: no value, no chart, no endpoint. */
export const FORCING_CONCEPT_ONLY =
  'More CO₂ in the air traps more outgoing heat. This link is described here, not calculated: the platform holds no forcing dataset.';

export const NOT_A_CLIMATE_MODEL = 'Shown as context from observed data; not a climate model.';

export const NO_COUNTRY_ATTRIBUTION =
  "Shares describe each country's part of cumulative emissions. No country series is regressed against temperature, and no warming is attributed to a country.";

export const SCENARIO_LABEL = 'Illustrative · implied outcomes, not projections';

/** The 1970+ PRIMAP-hist view is never called TCRE. */
export const ALL_GAS_TAG = 'Recent all-gas relationship · not TCRE';

/** Module anchors (one constant each, so the jump links and their targets cannot drift). */
export const CAUSAL_CHAIN_ANCHOR = 'causal-chain';
export const GLOBAL_RELATIONSHIP_ANCHOR = 'global-relationship';

// The IPCC AR6 TCRE range is read from the API (lib/ar6.ts; root SPEC.md §5.35 F), not kept here.
