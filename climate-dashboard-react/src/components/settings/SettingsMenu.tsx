import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Popover, type PopoverProps } from '@syena/ds';
import { SettingsPanel } from './SettingsPanel';

/** Icon-only in the collapsed rail: the width of the destinations' icons, so it stays inside the rail (see DashboardLayout's COLLAPSED_RAIL_BUTTON). */
const COLLAPSED = { width: 'calc(100% + 2 * var(--syn-space-1))', marginInline: 'calc(-1 * var(--syn-space-1))' } as const;
const RAIL_ROW = { width: '100%', justifyContent: 'flex-start', paddingInline: 'calc(var(--syn-space-2) - var(--syn-space-1) - var(--syn-layout-border-hairline))', gap: 'var(--syn-space-3)' } as const;

/**
 * The Settings trigger and its popover panel. `labelled` writes "Settings" beside the gear (the expanded rail, which has the room);
 * otherwise it is an icon button named "Settings" (the header, and the collapsed rail). The panel closes when the page changes or
 * the rail is expanded or collapsed, since its trigger has moved.
 */
export function SettingsMenu({ labelled = false, side = 'bottom', align = 'end', clearOf }: { labelled?: boolean } & Pick<PopoverProps, 'side' | 'align' | 'clearOf'>) {
  // A button with something to clear is the rail's (the header's has nothing around it).
  const inRail = Boolean(clearOf);
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const where = `${pathname}|${labelled}`;
  const [was, setWas] = useState(where);
  if (was !== where) {
    setWas(where);
    setOpen(false);
  }
  return (
    <Popover
      title="Settings"
      side={side}
      align={align}
      clearOf={clearOf}
      open={open}
      onOpenChange={setOpen}
      trigger={(props) => (labelled
        // Left-aligned like the destinations and the Collapse row: icon and word start where theirs do (the rail pads the utilities a little less than its rows).
        ? <Button variant="ghost" icon="settings" style={RAIL_ROW} {...props}>Settings</Button>
        : <Button variant="ghost" icon="settings" aria-label="Settings" title="Settings" style={inRail ? COLLAPSED : undefined} {...props} />)}
    >
      <SettingsPanel />
    </Popover>
  );
}
