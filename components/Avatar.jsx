"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import { AVATARS, AVATAR_MOTIONS, DEFAULT_AVATAR } from "../utils/avatars.mjs";

export default function Avatar({
  url = DEFAULT_AVATAR,
  name = "Profile",
  size = 40,
  animated = false,
}) {
  const [failedUrl, setFailedUrl] = useState(null);
  const root = useRef(null);
  const [active, setActive] = useState(false);
  const [motion, setMotion] = useState(
    () =>
      Math.max(
        0,
        AVATARS.findIndex((avatar) => avatar.url === url),
      ) % AVATAR_MOTIONS.length,
  );
  useEffect(() => {
    if (!animated) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = !("IntersectionObserver" in window);
    let running = false;
    let timer;
    function sync() {
      const next = visible && !document.hidden && !reduced.matches;
      if (next === running) return;
      running = next;
      setActive(next);
      clearInterval(timer);
      if (next)
        timer = setInterval(
          () => setMotion((previous) => (previous + 1) % AVATAR_MOTIONS.length),
          8000,
        );
    }
    const observer =
      "IntersectionObserver" in window
        ? new IntersectionObserver((entries) => {
            visible = entries.some((entry) => entry.isIntersecting);
            sync();
          })
        : null;
    if (root.current) observer?.observe(root.current);
    const frame = requestAnimationFrame(sync);
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      reduced.removeEventListener("change", sync);
    };
  }, [animated]);
  return (
    <span
      ref={root}
      className={`profile-avatar ${animated ? "profile-avatar-live" : ""}`}
      data-motion={animated ? AVATAR_MOTIONS[motion] : undefined}
      data-animating={animated ? active : undefined}
      style={{ width: size, height: size }}
    >
      <span className="profile-avatar-motion">
        {failedUrl === url ? (
          <UserRound size={size / 2} aria-label={name} />
        ) : (
          <Image
            src={url || DEFAULT_AVATAR}
            alt={name}
            width={size}
            height={size}
            unoptimized
            onError={() => setFailedUrl(url)}
          />
        )}
      </span>
    </span>
  );
}
