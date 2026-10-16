"use client";

import { useEffect, useState } from "react";
import Logo from "./Logo";

const LOADING_TIPS = [
  "Searching through your Reelbag...",
  "Organizing your secret meme stash...",
  "Stealing a few extra reels for safekeeping...",
  "Polishing the video playback engine...",
  "Unlocking your shared vault...",
  "Syncing with the mothership...",
];

const REEL_TILES = Array.from({ length: 7 }, (_, index) => index);

function ReelTile({ index }) {
  return (
    <div className="loading-reel" aria-hidden="true">
      <div className={`loading-reel-art loading-reel-art-${(index % 4) + 1}`}>
        <span className="loading-reel-play" />
      </div>
      <div className="loading-reel-meta">
        <span />
        <span />
      </div>
    </div>
  );
}

function MarqueeTrack({ row }) {
  return (
    <div className={`loading-marquee-track loading-marquee-track-${row}`}>
      {[0, 1].map((copy) => (
        <div className="loading-marquee-group" key={copy} aria-hidden="true">
          {REEL_TILES.map((index) => (
            <ReelTile key={`${copy}-${index}`} index={index + row} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function LoadingScreen() {
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(
      () => setTipIndex((current) => (current + 1) % LOADING_TIPS.length),
      1800,
    );
    return () => window.clearInterval(interval);
  }, []);

  return (
    <main className="loading-screen" aria-label="Loading Reelbag">
      <div className="loading-marquee" aria-hidden="true">
        {[0, 1, 2, 3].map((row) => (
          <div className={`loading-marquee-row loading-marquee-row-${row}`} key={row}>
            <MarqueeTrack row={row} />
          </div>
        ))}
      </div>
      <div className="loading-vignette" aria-hidden="true" />

      <section className="loading-card">
        <div className="loading-logo-wrap" aria-hidden="true">
          <span className="loading-logo-glow" />
          <Logo />
        </div>
        <h1 className="loading-wordmark">
          Reelbag<span>.</span>
        </h1>
        <p className="loading-tip" role="status" aria-live="polite">
          {LOADING_TIPS[tipIndex]}
        </p>
        <div className="loading-progress" aria-hidden="true">
          <span key={tipIndex} />
        </div>
      </section>
    </main>
  );
}
