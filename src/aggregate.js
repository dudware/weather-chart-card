// Groups consecutive hourly forecast items into N-hour points (forecast.hours_per_point).
// Buckets are aligned to local clock hours divisible by N (e.g. 06, 08, 10 for N = 2),
// so the first point may cover fewer hours when the forecast starts at an odd hour.

// Higher rank = more significant for the person reading the chart; the bucket shows the
// most significant condition so a one-hour shower is not hidden behind a cloudy hour.
const CONDITION_RANK = {
  'clear-night': 0, sunny: 0,
  partlycloudy: 1,
  cloudy: 2, windy: 2, 'windy-variant': 2,
  fog: 3,
  rainy: 4,
  pouring: 5, snowy: 5, 'snowy-rainy': 5,
  hail: 6, lightning: 6,
  'lightning-rainy': 7,
  exceptional: 8,
};

export const MAX_HOURS_PER_POINT = 6;

export function hoursPerPoint(forecastConfig) {
  if (!forecastConfig || forecastConfig.type !== 'hourly') return 1;
  const n = Math.floor(Number(forecastConfig.hours_per_point));
  return Number.isFinite(n) && n > 1 ? Math.min(n, MAX_HOURS_PER_POINT) : 1;
}

const finite = values => values.filter(value => typeof value === 'number' && Number.isFinite(value));
const round1 = value => Math.round(value * 10) / 10;
const mean = values => {
  const v = finite(values);
  return v.length ? round1(v.reduce((a, b) => a + b, 0) / v.length) : undefined;
};
const max = values => {
  const v = finite(values);
  return v.length ? Math.max(...v) : undefined;
};
const min = values => {
  const v = finite(values);
  return v.length ? Math.min(...v) : undefined;
};
const sum = values => {
  const v = finite(values);
  return v.length ? round1(v.reduce((a, b) => a + b, 0)) : undefined;
};

// Wind bearing is circular: the mean of 350° and 10° is 0°, not 180°.
// Weighted by speed so a calm hour does not swing the direction.
function meanBearing(items) {
  let x = 0;
  let y = 0;
  let count = 0;
  for (const item of items) {
    const bearing = item.wind_bearing;
    if (typeof bearing !== 'number' || !Number.isFinite(bearing)) continue;
    const weight = typeof item.wind_speed === 'number' && item.wind_speed > 0 ? item.wind_speed : 1;
    const rad = bearing * Math.PI / 180;
    x += Math.cos(rad) * weight;
    y += Math.sin(rad) * weight;
    count += 1;
  }
  if (!count) return items.length ? items[0].wind_bearing : undefined;
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) return items[0].wind_bearing;
  return Math.round(((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360);
}

function worstCondition(items) {
  let best;
  let bestRank = -1;
  for (const item of items) {
    const rank = CONDITION_RANK[item.condition];
    const value = rank === undefined ? -1 : rank;
    if (best === undefined || value > bestRank) {
      best = item.condition;
      bestRank = value;
    }
  }
  return best;
}

function mergeBucket(items) {
  if (items.length === 1) return items[0];
  const pick = key => items.map(item => item[key]);
  const merged = {
    ...items[0],
    condition: worstCondition(items),
    temperature: mean(pick('temperature')),
    apparent_temperature: mean(pick('apparent_temperature')),
    dew_point: mean(pick('dew_point')),
    humidity: mean(pick('humidity')),
    pressure: mean(pick('pressure')),
    cloud_coverage: mean(pick('cloud_coverage')),
    wind_speed: mean(pick('wind_speed')),
    wind_gust_speed: max(pick('wind_gust_speed')),
    wind_bearing: meanBearing(items),
    precipitation: sum(pick('precipitation')),
    precipitation_probability: max(pick('precipitation_probability')),
    uv_index: max(pick('uv_index')),
    hours: items.length,
  };
  const lows = pick('templow');
  if (finite(lows).length) merged.templow = min(lows);
  // Drop keys the source never had, so "undefined" does not reach the chart or labels.
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) delete merged[key];
  }
  return merged;
}

export function aggregateForecast(forecast, n) {
  if (!Array.isArray(forecast) || n <= 1) return Array.isArray(forecast) ? forecast : [];
  const result = [];
  let bucket = [];
  let bucketKey = null;
  for (const item of forecast) {
    const time = new Date(item && item.datetime);
    if (!Number.isFinite(time.getTime())) continue;
    // Local calendar day + hour slot: DST days still start a new bucket at midnight.
    const key = `${time.getFullYear()}-${time.getMonth()}-${time.getDate()}:${Math.floor(time.getHours() / n)}`;
    if (key !== bucketKey && bucket.length) {
      result.push(mergeBucket(bucket));
      bucket = [];
    }
    bucketKey = key;
    bucket.push(item);
  }
  if (bucket.length) result.push(mergeBucket(bucket));
  return result;
}
