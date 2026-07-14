export interface ProgressOverlayProps {
  visible: boolean;
  title: string;
  message: string;
  percent: number;
}

export default function ProgressOverlay({ visible, title, message, percent }: ProgressOverlayProps) {
  if (!visible) return null;

  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div className="progress-overlay" role="dialog" aria-modal="true" aria-labelledby="progress-title">
      <div className="progress-card">
        <h2 id="progress-title">{title}</h2>
        <p className="progress-message">{message}</p>
        <div className="progress-bar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100} role="progressbar">
          <div className="progress-bar-fill" style={{ width: `${clamped}%` }} />
        </div>
        <p className="progress-percent">{clamped}%</p>
      </div>
    </div>
  );
}
