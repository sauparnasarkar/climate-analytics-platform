import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { SynMotionProvider, type MotionChoice } from '@syena/ds';
import { readStoredMotion, storeMotion } from './motion';

const MotionChoiceContext = createContext<{ choice: MotionChoice; setChoice: (choice: MotionChoice) => void } | null>(null);

/**
 * The visitor's motion setting (System, Reduce or Full) for the whole app, resolved through the design system's motion provider: every
 * component that reads `useReducedMotion` follows it, and so do the stylesheet and the jump-link scrolling. System follows the device.
 */
export function MotionChoiceProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<MotionChoice>(readStoredMotion);
  const setChoice = useCallback((next: MotionChoice) => { setChoiceState(next); storeMotion(next); }, []);
  const value = useMemo(() => ({ choice, setChoice }), [choice, setChoice]);
  return (
    <MotionChoiceContext.Provider value={value}>
      <SynMotionProvider choice={choice}>{children}</SynMotionProvider>
    </MotionChoiceContext.Provider>
  );
}

export function useMotionChoice(): [MotionChoice, (choice: MotionChoice) => void] {
  const value = useContext(MotionChoiceContext);
  if (!value) throw new Error('useMotionChoice must be used inside MotionChoiceProvider');
  return [value.choice, value.setChoice];
}
