import Image from "next/image";
export const SLOGAN = "Your personal vault for video remakes & inspiration";
export default function Brand({ slogan = false, compact = false }) {
  return (
    <div className={`brand-block ${compact ? "brand-compact" : ""}`}>
      <span className="brand">
        <span className="brand-mark">
          <Image
            src="/icon.svg"
            alt=""
            width={64}
            height={64}
            unoptimized
            aria-hidden="true"
          />
        </span>
        <span className="brand-wordmark">
          Reelbag<span className="brand-dot">.</span>
        </span>
      </span>
      {slogan && <p className="brand-tagline">{SLOGAN}</p>}
    </div>
  );
}
