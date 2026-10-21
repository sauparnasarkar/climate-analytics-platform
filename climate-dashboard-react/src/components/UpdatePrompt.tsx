import { useState } from 'react';
import { Button } from '@syena/ds';
import { reloadForUpdate, useNewVersion } from '../pwa/updateState';

const UPDATE_PROMPT_STYLES = `
.update-prompt { position: fixed; z-index: 1000; left: var(--syn-layout-page-gutter); right: var(--syn-layout-page-gutter); bottom: calc(var(--syn-space-4) + env(safe-area-inset-bottom, 0px)); max-width: 28rem; margin-inline: auto; display: flex; align-items: center; gap: var(--syn-space-3); padding: var(--syn-space-3) var(--syn-space-4); border: var(--syn-layout-border-hairline) solid var(--syn-color-border-emphasis); border-radius: var(--syn-radius-card); background: var(--syn-color-surface-overlay); color: var(--syn-color-text-primary); box-shadow: var(--syn-elevation-2); }
.update-prompt p { flex: 1; margin: 0; }
`;

/** Offers a reload when a newer version of the app has been fetched and is waiting, so an open tab does not stay on an old build. */
export function UpdatePrompt() {
  const version = useNewVersion();
  // Putting it off hides this version's prompt; a still newer one asks again.
  const [putOff, setPutOff] = useState(0);
  if (!version || version === putOff) return null;
  return (
    <div role="status" className="update-prompt">
      <style>{UPDATE_PROMPT_STYLES}</style>
      <p className="syn-text-md">A new version is available.</p>
      <Button size="small" onClick={reloadForUpdate}>Reload</Button>
      <Button size="small" variant="ghost" onClick={() => setPutOff(version)}>Later</Button>
    </div>
  );
}
