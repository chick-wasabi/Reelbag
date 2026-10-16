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
  "Rewinding that one perfect transition...",
  "Sorting chaos into very tidy folders...",
  "Checking every pocket for lost reels...",
  "Teaching pixels a few new tricks...",
  "Dusting off your favorite clips...",
  "Making room for one more masterpiece...",
  "Untangling links from the group chat...",
  "Sharpening thumbnails for maximum drama...",
  "Convincing the algorithm to take a break...",
  "Filing memes under extremely important...",
  "Warming up the replay button...",
  "Counting likes we definitely do not track...",
  "Rescuing inspiration from tab overload...",
  "Arranging your next creative rabbit hole...",
  "Making your folders look suspiciously organized...",
  "Finding the clip you swore you saved...",
  "Packing tiny videos into a roomy vault...",
  "Giving your favorites the VIP treatment...",
  "Preparing a scroll worth getting lost in...",
  "Turning link clutter into visual order...",
  "Pinning the good stuff where it belongs...",
  "Asking the cloud to hurry politely...",
  "Calibrating maximum replay satisfaction...",
  "Gathering remakes, recipes, and ridiculousness...",
  "Keeping your inspiration safely off the floor...",
  "Opening the vault with cinematic timing...",
  "Making sure every reel knows its place...",
  "Loading fewer distractions and better ideas...",
  "Cueing your personal highlight reel...",
  "Almost ready for the good part...",
];

const REEL_TILES = Array.from({ length: 7 }, (_, index) => index);

function ReelTile({ index }) {
  return (
    <div
      className={`loading-reel ${index % 3 === 0 ? "has-accent-glow" : ""}`}
      aria-hidden="true"
    >
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
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [tipVisible, setTipVisible] = useState(false);

  useEffect(() => {
    const revealFrame = window.requestAnimationFrame(() => {
      setCurrentTipIndex(Math.floor(Math.random() * LOADING_TIPS.length));
      setTipVisible(true);
    });
    let fadeInterval;
    const firstFade = window.setTimeout(() => {
      setTipVisible(false);
      fadeInterval = window.setInterval(() => setTipVisible(false), 1500);
    }, 1200);
    const rotateInterval = window.setInterval(() => {
      setCurrentTipIndex((current) => (current + 1) % LOADING_TIPS.length);
      setTipVisible(true);
    }, 1500);
    return () => {
      window.clearInterval(rotateInterval);
      window.clearTimeout(firstFade);
      window.cancelAnimationFrame(revealFrame);
      if (fadeInterval) window.clearInterval(fadeInterval);
    };
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
        <p
          className={`loading-tip ${tipVisible ? "is-visible" : ""}`}
          role="status"
          aria-live="polite"
        >
          {LOADING_TIPS[currentTipIndex]}
        </p>
        <div className="loading-progress" aria-hidden="true">
          <span key={currentTipIndex} />
        </div>
      </section>
    </main>
  );
}
