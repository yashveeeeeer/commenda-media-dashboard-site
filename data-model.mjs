// Pure data rules shared by the explorer and its regression tests.
export const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;

export function changePercent(current, baseline) {
  return Number.isFinite(current) && Number.isFinite(baseline) && baseline > 0
    ? 100 * (current / baseline - 1) : Number.NaN;
}

export function competitionRank(row, index) {
  const value = numeric(row?.[index]);
  return Number.isFinite(value) ? 1 + row.filter(other => Number.isFinite(other) && other > value).length : Number.NaN;
}

export function supportedPeriods(metric, population = false) {
  return (population ? metric.perMillionPeople : metric.value)
    .flatMap((row, index) => row.some(value => Number.isFinite(value)) ? [index] : []);
}

export function coverageFor(metric, current, baseline, population = false) {
  const rows = population ? metric.perMillionPeople : metric.value;
  const values = rows[current] || [];
  return {
    reported: metric.value[current].filter(Number.isFinite).length,
    available: values.filter(Number.isFinite).length,
    comparable: values.filter((v,i) => Number.isFinite(v) && Number.isFinite(rows[baseline]?.[i]) && rows[baseline][i] > 0).length,
  };
}

export function observationStatus(payload, metric, current, baseline, country, population = false) {
  const raw = numeric(metric.value[current]?.[country]);
  const baseRaw = numeric(metric.value[baseline]?.[country]);
  if (!Number.isFinite(raw)) return 'current_not_published';
  if (population && !Number.isFinite(metric.perMillionPeople[current]?.[country])) return 'current_population_missing';
  if (!Number.isFinite(baseRaw)) return 'baseline_not_published';
  if (population && !Number.isFinite(metric.perMillionPeople[baseline]?.[country])) return 'baseline_population_missing';
  if (baseRaw === 0) return 'zero_baseline';
  return 'comparable';
}

export function validatePayload(payload, geography) {
  const assert = (condition, message) => { if (!condition) throw new Error(`Data validation: ${message}`); };
  const { codes, periods, metrics } = payload;
  assert(Array.isArray(codes) && codes.length > 0, 'economy codes missing');
  assert(codes.every(c => typeof c === 'string' && /^[A-Z]{2}$/.test(c) && c !== 'EU'), 'invalid economy code');
  assert(new Set(codes).size === codes.length, 'duplicate economy code');
  assert(payload.release.economyCount === codes.length && payload.release.metricCount === metrics.length, 'release counts disagree');
  assert(new Set(metrics.map(m => m.id)).size === metrics.length, 'duplicate metric');
  assert(new Set(periods.map(p => p.key)).size === periods.length, 'duplicate period key');
  periods.forEach((p,i) => {
    assert(/^\d{4}-Q[1-4]$/.test(p.source), 'invalid quarter');
    const year = +p.source.slice(0,4), quarter = +p.source.slice(-1);
    assert(p.key === `${year}_q${quarter}` && p.label === `${year} Q${quarter}`, 'period labels disagree');
    if (i) assert(year * 4 + quarter === +periods[i-1].source.slice(0,4) * 4 + +periods[i-1].source.slice(-1) + 1, 'nonconsecutive quarter');
  });
  const shape = (matrix, name) => assert(Array.isArray(matrix) && matrix.length === periods.length && matrix.every(row => Array.isArray(row) && row.length === codes.length && row.every(v => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0))), `${name} matrix is invalid`);
  shape(payload.populationYear, 'population years');
  shape(payload.populationTotal, 'population');
  const same = (a,b) => a === null ? b === null : typeof b === 'number' && Math.abs(a-b) <= 0.0000011;
  metrics.forEach(metric => {
    ['value','rank','globalSharePct','perMillionPeople'].forEach(field => shape(metric[field], `${metric.id} ${field}`));
    metric.value.forEach((row,p) => {
      const total = row.reduce((sum,v) => sum + (v ?? 0),0);
      row.forEach((v,c) => {
        assert(v === null || Number.isSafeInteger(v), `${metric.id} count is not an integer`);
        assert(same(v === null ? null : competitionRank(row,c),metric.rank[p][c]), `${metric.id} rank disagrees`);
        assert(same(v === null || !total ? null : v/total*100,metric.globalSharePct[p][c]), `${metric.id} share disagrees`);
        const pop = payload.populationTotal[p][c];
        const expected = v === null || !pop ? null : v/pop*1e6;
        assert(same(expected,metric.perMillionPeople[p][c]), `${metric.id} population rate disagrees`);
        assert(pop === null ? payload.populationYear[p][c] === null : payload.populationYear[p][c] === +periods[p].source.slice(0,4), 'population year does not match quarter');
      });
    });
    const available = supportedPeriods(metric);
    assert(available.length > 0 && metric.startPeriod === periods[available[0]].source && metric.endPeriod === periods[available.at(-1)].source, `${metric.id} coverage dates disagree`);
  });
  const geoCodes = geography.features.map(f => f.properties.economy_iso2);
  assert(new Set(geoCodes).size === geoCodes.length && geoCodes.length === codes.length && codes.every(c => geoCodes.includes(c)), 'geometry join is incomplete or duplicated');
  const identities = payload.economies.map(e => e.iso2);
  assert(new Set(identities).size === identities.length && identities.length === codes.length && codes.every(c => identities.includes(c)), 'economy identities disagree');
  return true;
}
