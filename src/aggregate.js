// Thins an hourly forecast to one point every N hours (forecast.hours_per_point).
// Each point is the provider's own forecast for that hour, unchanged; only the
// precipitation of the skipped hours is added to it, so no rain disappears
// between points. Points are aligned to local clock hours divisible by N
// (e.g. 06, 08, 10 for N = 2); when the forecast starts at an odd hour, that
// first hour is shown as it is.

export const MAX_HOURS_PER_POINT = 6;

export function hoursPerPoint(forecastConfig) {
  if (!forecastConfig || forecastConfig.type !== 'hourly') return 1;
  const n = Math.floor(Number(forecastConfig.hours_per_point));
  return Number.isFinite(n) && n > 1 ? Math.min(n, MAX_HOURS_PER_POINT) : 1;
}

function toPoint(items) {
  const point = { ...items[0] };
  const amounts = items.map(item => item.precipitation).filter(value => typeof value === 'number' && Number.isFinite(value));
  if (amounts.length) point.precipitation = Math.round(amounts.reduce((a, b) => a + b, 0) * 10) / 10;
  return point;
}

export function aggregateForecast(forecast, n) {
  if (!Array.isArray(forecast) || n <= 1) return Array.isArray(forecast) ? forecast : [];
  const result = [];
  let bucket = [];
  let bucketKey = null;
  for (const item of forecast) {
    const time = new Date(item && item.datetime);
    if (!Number.isFinite(time.getTime())) continue;
    // Local calendar day + hour slot: a DST day still starts a new slot at midnight.
    const key = `${time.getFullYear()}-${time.getMonth()}-${time.getDate()}:${Math.floor(time.getHours() / n)}`;
    if (key !== bucketKey && bucket.length) {
      result.push(toPoint(bucket));
      bucket = [];
    }
    bucketKey = key;
    bucket.push(item);
  }
  if (bucket.length) result.push(toPoint(bucket));
  return result;
}
