"use client";
import Image from "next/image";
import { useState } from "react";
import { UserRound } from "lucide-react";
import {
  DEFAULT_AVATAR,
  DEFAULT_AVATAR_FRAME,
} from "../utils/avatars.mjs";

export default function Avatar({
  url = DEFAULT_AVATAR,
  name = "Profile",
  size = 40,
  frame = DEFAULT_AVATAR_FRAME,
}) {
  const [failedUrl, setFailedUrl] = useState(null);
  return (
    <span
      className={`profile-avatar avatar-frame-${frame}`}
      style={{ width: size, height: size }}
    >
      <span className="profile-avatar-art">
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
