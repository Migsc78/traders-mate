export default function ScoreLegend() {
  return (
    <div className="score-legend" aria-label="Priority score key">
      <span className="score-legend-title">Score key</span>
      <span className="score-legend-item">
        <span className="score hot">70+</span> Hot — call first
      </span>
      <span className="score-legend-item">
        <span className="score warm">45–69</span> Warm — good prospect
      </span>
      <span className="score-legend-item">
        <span className="score cool">&lt;45</span> Cool — lower priority
      </span>
      <span className="score-legend-note">
        0–100 priority based on website need, reviews, rating, trade value, domain availability, and mobile phone.
      </span>
    </div>
  );
}
