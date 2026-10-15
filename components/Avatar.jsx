"use client";
import Image from "next/image";
import { useState } from "react";
import { UserRound } from "lucide-react";
import { DEFAULT_AVATAR } from "../utils/avatars.mjs";

export default function Avatar({
  url = DEFAULT_AVATAR,
  name = "Profile",
  size = 40,
}) {
  const [failedUrl, setFailedUrl] = useState(null);
  return (
    <span className="profile-avatar" style={{ width: size, height: size }}>
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
  );
}
