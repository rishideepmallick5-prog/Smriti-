// src/components/TrendBadge.jsx
//
// Renders a short plain-language insight line beneath a game performance chart.
// Designed for caregiver/doctor audiences — factual, no gamified tone.
//
// Props:
//   trend     {object}  Result from getPerformanceTrend()
//   gameLabel {string}  e.g. "Memory Game", "Pattern Game"

import "./TrendBadge.css";

export default function TrendBadge({ trend, gameLabel }) {
  if (!trend) return null;

  const { status, delta, recentAvg } = trend;

  let icon, text, cssClass;

  switch (status) {
    case "improving":
      icon = "📈";
      text = `Improving — up ${Math.abs(delta)}% over recent sessions (avg. ${recentAvg}%)`;
      cssClass = "trend-badge trend-badge--improving";
      break;

    case "declining":
      icon = "📉";
      text = `Declining — down ${Math.abs(delta)}% over recent sessions (avg. ${recentAvg}%)`;
      cssClass = "trend-badge trend-badge--declining";
      break;

    case "stable":
      icon = "➖";
      text = `Stable performance (avg. ${recentAvg}%)`;
      cssClass = "trend-badge trend-badge--stable";
      break;

    case "insufficient":
    default:
      return (
        <p className="trend-badge trend-badge--insufficient">
          Not enough {gameLabel} sessions yet to show a trend.
        </p>
      );
  }

  return (
    <p className={cssClass} aria-label={`${gameLabel} trend: ${text}`}>
      {icon} {text}
    </p>
  );
}
