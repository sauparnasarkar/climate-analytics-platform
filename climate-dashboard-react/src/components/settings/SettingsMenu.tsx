import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Popover, type PopoverProps } from '@syena/ds';
import { SettingsPanel } from './SettingsPanel';

/**
 * The Settings trigger and its popover panel. `labelled` writes "Settings" beside the gear (the expanded rail, which has the room);
 * otherwise it is an icon button named "Settings" (the header, and the collapsed rail). The panel closes when the page changes or
 * the rail is expanded or collapsed, since its trigger has moved.
 */
export function SettingsMenu({ labelled = false, side = 'bottom', align = 'end' }: { labelled?: boolean } & Pick<PopoverProps, 'side' | 'align'>) {
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
      open={open}
      onOpenChange={setOpen}
      trigger={(props) => (labelled
        ? <Button variant="ghost" icon="settings" {...props}>Settings</Button>
        : <Button variant="ghost" icon="settings" aria-label="Settings" title="Settings" {...props} />)}
    >
      <SettingsPanel />
    </Popover>
  );
}
