export const dynamic = "force-dynamic";

const PACKAGE_NAME = "app.vercel.reelbag.twa";

function normalizeFingerprint(value = "") {
  const compact = value.trim().replaceAll(":", "").toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(compact)) return null;
  return compact.match(/.{2}/g).join(":");
}

export function GET() {
  const fingerprint = normalizeFingerprint(
    process.env.ANDROID_CERT_SHA256_FINGERPRINT,
  );

  if (!fingerprint) {
    return Response.json(
      { error: "Android certificate fingerprint is not configured." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  return Response.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: PACKAGE_NAME,
          sha256_cert_fingerprints: [fingerprint],
        },
      },
    ],
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=3600",
      },
    },
  );
}
