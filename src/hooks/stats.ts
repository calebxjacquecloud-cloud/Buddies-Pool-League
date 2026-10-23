import { useMemo } from 'react';
import { backend } from '../data';
import { computeStats, type StatsFilter } from '../shared/stats';
import { useLive } from './data';

export function useStatsData() {
  return useLive(() => backend.getStatsData(), '*');
}

export function useStats(filter: StatsFilter = {}) {
  const live = useStatsData();
  const rows = useMemo(() => (live.data ? computeStats(live.data, filter) : null), [live.data, filter.from, filter.to]);
  return { rows, data: live.data, loading: live.loading };
}
