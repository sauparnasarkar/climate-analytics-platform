import type { MotionChoice } from '@syena/ds';

// The visitor's own choice of motion, kept in this origin's localStorage; absent means System (follow the device).
export const MOTION_STORAGE_KEY = 'degrees-of-carbon-motion';

/** The three choices in the order the control shows them. */
export const MOTION_CHOICES: { value: MotionChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'reduce', label: 'Reduce' },
  { value: 'full', label: 'Full' },
];

const isMotionChoice = (value: unknown): value is MotionChoice => value === 'reduce' || value === 'full';

/** The stored choice, or System. Read in a state initializer, so Reduce is in force from the first render and nothing autoplays before it. Storage can throw (private browsing, a blocking extension or policy). */
export function readStoredMotion(): MotionChoice {
  try {
    const stored = localStorage.getItem(MOTION_STORAGE_KEY);
    return isMotionChoice(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** Reduce and Full are stored; System is the absence of a stored choice, so the device decides from the next visit on too. With storage blocked the choice lasts for the session. */
export function storeMotion(choice: MotionChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(MOTION_STORAGE_KEY);
    else localStorage.setItem(MOTION_STORAGE_KEY, choice);
  } catch {
    // Not persisted.
  }
}
