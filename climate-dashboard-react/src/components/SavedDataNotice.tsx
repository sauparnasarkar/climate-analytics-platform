import { useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { InlineAlert } from '@syena/ds';
import { describeSavedAt, resetSavedData, savedDataSince, subscribeSavedData } from '../lib/savedCopy';

/** Said once at the top of a page whose data, in whole or part, came from the copy saved in this browser. It goes when the next response is live.
 * Not on the Ask page: a failed answer there is an error with Try again, never this notice. */
export function SavedDataNotice() {
  const { pathname } = useLocation();
  const savedAt = useSyncExternalStore(subscribeSavedData, savedDataSince, () => null);
  // A new page asks for its own data; what the last page was shown is not this page's.
  useEffect(() => { resetSavedData(); }, [pathname]);
  if (!savedAt || pathname === '/ask') return null;
  return <InlineAlert variant="warning">Showing saved data from {describeSavedAt(savedAt)}. Couldn’t reach the server.</InlineAlert>;
}
