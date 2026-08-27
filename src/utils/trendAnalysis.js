// src/utils/trendAnalysis.js
//
// Derives a simple performance trend from a sorted array of game sessions.
//
// Each session is expected to have:
//   { accuracy: number (0-100), played_at: ISO string }
//
// The caller is responsible for deriving `accuracy` from correct/total
// and for sorting oldest -> newest before calling this function.

/**
 * getPerformanceTrend
 *
 * @param {Array<{ accuracy: number, played_at: string }>} sessions
 *   Array of sessions sorted oldest -> newest.
 * @param {number} [threshold=5]
 *   Minimum percentage-point delta to classify as improving/declining.
 *   Avoids flagging noise as a real trend.
 *
 * @returns {{ status: string, delta: number|null, recentAvg: number|null, earlierAvg: number|null, message: string }}
 */
export function getPerformanceTrend(sessions, threshold = 5) {
  const valid = (sessions || []).filter(
    (s) => s != null && typeof s.accuracy === "number" && isFinite(s.accuracy)
  );

  if (valid.length < 2) {
    return {
      status: "insufficient",
      delta: null,
      recentAvg: null,
      earlierAvg: null,
      message: "Not enough sessions yet to show a trend",
    };
  }

  // Split into two halves.
  // For 6+ sessions, compare last 3 vs previous 3 for a tighter window.
  // For 2-5 sessions, split at the midpoint.
  let earlier, recent;

  if (valid.length >= 6) {
    earlier = valid.slice(-6, -3); // 4th, 5th, 6th from the end
    recent  = valid.slice(-3);      // last 3
  } else {
    const mid = Math.floor(valid.length / 2);
    earlier = valid.slice(0, mid);
    recent  = valid.slice(mid);
  }

  const avg = (arr) => arr.reduce((sum, s) => sum + s.accuracy, 0) / arr.length;

  const earlierAvg = Math.round(avg(earlier) * 10) / 10;
  const recentAvg  = Math.round(avg(recent)  * 10) / 10;
  const delta      = Math.round((recentAvg - earlierAvg) * 10) / 10;

  let status;
  if (delta > threshold) {
    status = "improving";
  } else if (delta < -threshold) {
    status = "declining";
  } else {
    status = "stable";
  }

  return { status, delta, recentAvg, earlierAvg };
}
