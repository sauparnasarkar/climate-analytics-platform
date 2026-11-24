import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, InlineAlert, Tag, Text } from '@syena/ds';
import type { ExplorerDataset } from '../../api/types';
import { METHODS_ANCHORS, methodsHref, vintageOf } from '../../lib/methodology';
import { coverageText, LICENCE_TAG_COLOR } from '../../lib/explorerDatasets';

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Text as="dt" type="caption" tone="muted">{label}</Text>
      <Text as="dd" type="text-sm" style={{ margin: '2px 0 0' }}>{children}</Text>
    </div>
  );
}

/** What a data set is: one row's meaning, coverage, source, licence, and where its figures are charted. Reads everything from the API (SPEC.md §5.37). */
export function DatasetCard({ dataset: d }: { dataset: ExplorerDataset }) {
  const source = d.source;
  const vintage = source ? vintageOf({ source_release: source.source_release, retrieved_at: source.retrieved_at }) : null;
  const preliminary = typeof source?.source_release === 'object' && source.source_release !== null && source.source_release.preliminary === true;
  const charted = d.charted_on;
  return (
    <Card as="section" aria-label="About this data set" padding="compact" className="explorer-card">
      <Text as="p" type="text-sm" style={{ margin: '0 0 12px' }}>{d.description}</Text>
      <dl className="explorer-facts">
        <Fact label="One row is">{d.row_label}</Fact>
        <Fact label="Coverage">{coverageText(d)}</Fact>
        <Fact label="Source">{source?.name ?? d.source_label}</Fact>
        <Fact label="Licence">
          {source?.short_license && d.licence_class ? <Tag color={LICENCE_TAG_COLOR[d.licence_class]}>{source.short_license}</Tag> : 'Not recorded'}
        </Fact>
      </dl>
      <Text as="p" type="caption" tone="muted" style={{ margin: '12px 0 0' }}>
        {[vintage ? capitalise(vintage.label) : null, preliminary ? 'Preliminary release, not yet peer reviewed' : null].filter(Boolean).join(' · ')}
        {vintage || preliminary ? ' · ' : ''}
        <Link className="area2-link" to={methodsHref(METHODS_ANCHORS.sources)}>How to cite</Link>
        {charted.length > 0 ? ' · Charted on ' : ''}
        {charted.map((c, i) => (
          <span key={c.path}>
            {i > 0 ? (i === charted.length - 1 ? ' and ' : ', ') : ''}
            <Link className="area2-link" to={c.path}>{c.label}</Link>
          </span>
        ))}
      </Text>
    </Card>
  );
}

/** The share-alike notice a CC BY-NC-SA data set (both PRIMAP-hist ones) carries, then the source's own caveats. The alert holds only text (it wraps its content in a
 * paragraph); the caveats follow as a list. */
export function LicenceNotice({ dataset: d }: { dataset: ExplorerDataset }) {
  if (d.licence_class !== 'non_commercial_share_alike') return null;
  const caveats = d.source?.caveats ?? [];
  return (
    <>
      <InlineAlert variant="default">
        Non-commercial use only. Anything you publish from this data must carry the same licence (share-alike) and credit {d.source_label}; the download includes the notice and the citation.
      </InlineAlert>
      {caveats.length > 0 ? (
        <ul className="syn-caption explorer-caveats">
          {caveats.map((c) => <li key={c}>{c}</li>)}
        </ul>
      ) : null}
    </>
  );
}
