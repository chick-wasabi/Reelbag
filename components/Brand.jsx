import Logo from "./Logo";
export const SLOGAN = "Catch the clip, don't let it slip.";
export default function Brand({ slogan = false, compact = false }) {
  return (
    <div className={`brand-block ${compact ? "brand-compact" : ""}`}>
      <span className="brand">
        <span className="brand-mark">
          <Logo />
        </span>
        <span className="brand-wordmark">
          Reelbag<span className="brand-dot">.</span>
        </span>
      </span>
      {slogan && <p className="brand-tagline">{SLOGAN}</p>}
    </div>
  );
}
