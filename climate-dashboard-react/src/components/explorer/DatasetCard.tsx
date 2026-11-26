import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, Icon, Tag, Text } from '@syena/ds';
import type { ExplorerDataset } from '../../api/types';
import { METHODS_ANCHORS, methodsHref, vintageOf } from '../../lib/methodology';
import { coverageText, LICENCE_TAG_COLOR, licenceName } from '../../lib/explorerDatasets';

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** What a data set is, in two lines (SPEC.md §5.37.1): the description; then licence tag · one row · coverage · short source label · vintage · How to cite · Charted on.
 * A CC BY-NC-SA data set adds a one-line notice below a hairline; the source's caveats sit in a closed disclosure. Everything is read from the API. It is not pinned: it opens
 * the Dataset Preview section, so the jump link lands on it and the table. `shownFrom` is the table's current first year (the Year range slider's), for the coverage note. */
export function DatasetCard({ dataset: d, shownFrom }: { dataset: ExplorerDataset; shownFrom?: number }) {
  const source = d.source;
  const vintage = source ? vintageOf({ source_release: source.source_release, retrieved_at: source.retrieved_at }) : null;
  const preliminary = typeof source?.source_release === 'object' && source.source_release !== null && source.source_release.preliminary === true;
  const vintageText = vintage ? `${capitalise(vintage.label)}${preliminary ? ', preliminary release' : ''}` : preliminary ? 'Preliminary release' : null;
  const charted = d.charted_on;
  const caveats = source?.caveats ?? [];
  const name = licenceName(source?.short_license);
  const facts: ReactNode[] = [
    source?.short_license && d.licence_class
      ? <Tag key="licence" size="small" color={LICENCE_TAG_COLOR[d.licence_class]}>{source.short_license}</Tag>
      : <span key="licence">Licence not recorded</span>,
    <span key="row">One row: {d.row_label}</span>,
    <span key="coverage">{coverageText(d, shownFrom)}</span>,
    <span key="source">{d.source_label}</span>,
    ...(vintageText ? [<span key="vintage">{vintageText}</span>] : []),
    <Link key="cite" className="area2-link" to={methodsHref(METHODS_ANCHORS.sources)}>How to cite</Link>,
    ...(charted.length > 0
      ? [
          <span key="charted">
            Charted on{' '}
            {charted.map((c, i) => (
              <span key={c.path}>
                {i > 0 ? ', ' : ''}
                <Link className="area2-link" to={c.path}>{c.label}</Link>
              </span>
            ))}
          </span>,
        ]
      : []),
  ];
  return (
    <Card as="div" role="group" aria-label="About this data set" padding="compact" className="explorer-card">
      <Text as="p" type="text-sm" style={{ margin: '0 0 6px' }}>{d.description}</Text>
      {/* The middots between facts are drawn by the stylesheet (decorative, never in the markup), so one can never start or end a wrapped row. */}
      <p className="explorer-facts-line">{facts}</p>
      {d.licence_class === 'non_commercial_share_alike' ? (
        <p className="explorer-notice">
          <Icon name="info" size="small" />
          <span>
            Non-commercial use only. Anything you publish from this data must carry {name ?? 'the same licence'} and credit {d.source_label}; the download includes the notice.
          </span>
        </p>
      ) : null}
      {caveats.length > 0 ? (
        <details className="explorer-notes">
          <summary>Source notes ({caveats.length})</summary>
          <ul>{caveats.map((c) => <li key={c}>{c}</li>)}</ul>
        </details>
      ) : null}
    </Card>
  );
}
