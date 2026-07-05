/**
 * The Signet wax seal — ported from the <symbol id="seal"> in the spec HTML.
 * Rendered inline so it needs no <defs> plumbing and works in any component.
 */
export function Seal({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="var(--wax)" />
      <circle cx="50" cy="50" r="46" fill="none" stroke="var(--wax-deep)" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="var(--gilt)" strokeWidth="1" opacity=".8" />
      <circle cx="50" cy="50" r="34" fill="none" stroke="var(--wax-deep)" strokeWidth="1" opacity=".6" />
      <text
        x="50"
        y="63"
        textAnchor="middle"
        fontFamily="var(--display)"
        fontSize="42"
        fill="var(--paper)"
      >
        S
      </text>
      <path d="M50 18 A32 32 0 0 1 50 82" fill="none" stroke="var(--paper)" strokeWidth=".6" opacity=".3" />
    </svg>
  );
}
