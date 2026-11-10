type LoadingIndicatorProps = { label: string; compact?: boolean };

export default function LoadingIndicator({ label, compact = false }: LoadingIndicatorProps) {
  return <div className={'brand-loader' + (compact ? ' compact' : '')} role="status" aria-live="polite" aria-busy="true">
    <span className="brand-loader-art" aria-hidden="true">
      <span className="brand-loader-orbit" />
      <span className="brand-loader-satellite" />
      <span className="brand-loader-core">
        <svg viewBox="0 0 48 36" fill="none">
          <path d="M4 8h24v18H4zM28 14h9l7 7v5H28z" fill="currentColor" opacity=".13" />
          <path d="M4 8h24v18H4zM28 14h9l7 7v5H28z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M32 15v7h9M9 31a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM35 31a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="2.2" />
          <path d="M8 13h11M8 18h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity=".75" />
        </svg>
      </span>
    </span>
    <span className="brand-loader-label">{label}</span>
  </div>;
}
