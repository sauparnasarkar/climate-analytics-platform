import { useMemo } from 'react';
import { api } from '../api/client';
import { yearValues } from '../lib/climateSignal';
import { buildScenarioView, type ScenarioView } from '../lib/scenarioView';
import { useAsync } from './useAsync';

/** The implied-temperature-by-scenario view (requirements §1.3.5): the scenario output with the observed history it continues from (the fossil pair, the annual
 * and the 5-year-mean temperature). `view` is null when the scenario output is not usable, and the section is then left out. The history requests are optional:
 * a failure of one leaves that piece empty, never zero. `loading` holds while any of the four is out, so a deep link waits for the section to take its height. */
export function useScenarioTemperature(): { view: ScenarioView | null; loading: boolean } {
  const scenario = useAsync(() => api.correlationScenarioTemperature(), []);
  const fossil = useAsync(() => api.correlationEmissionsTemperature({ variant: 'fossil' }), []);
  const temperature = useAsync(() => api.correlationTemperature({ baseline: '1850_1900' }), []);
  const mean5y = useAsync(() => api.correlationTemperature({ view: 'mean5y', baseline: '1850_1900' }), []);
  const view = useMemo(
    () => buildScenarioView(scenario.data, fossil.data, temperature.data ? yearValues(temperature.data.points) : [], mean5y.data ? yearValues(mean5y.data.points) : []),
    [scenario.data, fossil.data, temperature.data, mean5y.data],
  );
  return { view, loading: scenario.loading || fossil.loading || temperature.loading || mean5y.loading };
}
