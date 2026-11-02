import { CAUSAL_CHAIN, CAUSAL_CHAIN_ANCHOR, FORCING_CONCEPT_ONLY } from '../../lib/climateCopy';
import { fmtAnomaly, type ClimateSignal } from '../../lib/climateSignal';
import { fmtInt } from '../../lib/landingData';
import type { AlignedChain } from '../../lib/alignedYear';
import { AlignedNote } from '../climate/AlignedNote';
import { BaselineChip } from '../climate/BaselineChip';

const cell = { display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 16px', minWidth: 0 } as const;
const head = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } as const;
const label = { fontFamily: 'var(--syn-family-ui)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' } as const;
const weak = { margin: 0, color: 'var(--syn-color-text-muted)' } as const;

/**
 * The causal chain as four cells in one strip (requirements §2.4): emissions → concentration → radiative forcing → temperature anomaly. These are
 * GLOBAL, ACCUMULATED quantities and the copy says so. Forcing is a concept only -- no value, no chart (the platform holds no forcing dataset).
 * Every figure is read from the API; a cell whose figure is missing says nothing rather than showing a zero.
 */
export function CausalChain({ signal, chain }: { signal: ClimateSignal; chain: AlignedChain }) {
  const { ppm1850 } = signal;
  const { emissions, concentration, temperature } = chain;
  const [emissionsName, concentrationName, forcingName, temperatureName] = CAUSAL_CHAIN;
  return (
    <section id={CAUSAL_CHAIN_ANCHOR} aria-labelledby="causal-chain-heading" style={{ marginBottom: 24 }}>
      <h2 id="causal-chain-heading" className="syn-title-md" style={{ margin: '0 0 4px' }}>Causal chain</h2>
      <p className="syn-caption" style={{ ...weak, margin: '0 0 12px' }}>All four steps for <strong>{chain.year}</strong>, the latest year every step has data.</p>
      <style>{'.module-chain { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--syn-color-border-subtle); border-radius: 8px; overflow: hidden; background: var(--syn-color-surface-raised); list-style: none; margin: 0; padding: 0; } .module-chain > li + li { border-left: 1px solid var(--syn-color-border-subtle); } .module-chain__forcing { background: repeating-linear-gradient(135deg, transparent 0 7px, var(--syn-color-border-subtle) 7px 8px); } @media (max-width: 900px) { .module-chain { grid-template-columns: 1fr; } .module-chain > li + li { border-left: 0; border-top: 1px solid var(--syn-color-border-subtle); } }'}</style>
      <ol className="module-chain">
        <li style={cell}>
          <span style={head}><span style={label}>1 · {emissionsName}</span><AlignedNote note={emissions?.note ?? null} label="emissions" /></span>
          {emissions ? (
            <>
              <strong className="syn-title-md" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtInt(emissions.value)} <span className="syn-text-lg">MtCO₂ in {emissions.year}</span></strong>
              <p className="syn-caption" style={weak}>World annual CO₂. Each year&apos;s emissions add to a stock that stays.</p>
              <BaselineChip baseline="none · annual level" source="OWID" />
            </>
          ) : (
            <p className="syn-caption" style={weak}>Each year&apos;s emissions add to a stock that stays.</p>
          )}
        </li>
        <li style={cell}>
          <span style={head}><span style={label}>2 · {concentrationName}</span><AlignedNote note={concentration.note} label="concentration" /></span>
          <strong className="syn-title-md" style={{ fontVariantNumeric: 'tabular-nums' }}>{concentration.value.toFixed(1)} <span className="syn-text-lg">ppm in {concentration.year}</span></strong>
          <p className="syn-caption" style={weak}>About half of emitted CO₂ stays in the air{ppm1850 !== null ? `: ${ppm1850.toFixed(0)} ppm in 1850` : ''}.</p>
          <BaselineChip baseline="1850" source="NOAA + Law Dome" />
        </li>
        <li style={cell} className="module-chain__forcing">
          <span style={label}>3 · {forcingName} · concept</span>
          <p className="syn-text-lg" style={{ margin: 0 }}>Not calculated here.</p>
          <p className="syn-caption" style={weak}>{FORCING_CONCEPT_ONLY}</p>
        </li>
        <li style={cell}>
          <span style={head}><span style={label}>4 · {temperatureName}</span><AlignedNote note={temperature.note} label="temperature" /></span>
          <strong className="syn-title-md" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtAnomaly(temperature.value)} <span className="syn-text-lg">in {temperature.year}</span></strong>
          <p className="syn-caption" style={weak}>Global surface temperature anomaly.</p>
          <BaselineChip baseline="1850–1900" source="Berkeley Earth" />
        </li>
      </ol>
    </section>
  );
}
