import signingCertificate from "../../../android/signing-certificate.json";

export const dynamic = "force-dynamic";

const PACKAGE_NAME = "app.vercel.reelbag.twa";
const NO_CACHE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Pragma: "no-cache",
};

function normalizeFingerprint(value) {
  if (typeof value !== "string") return null;
  const compact = value.trim().replaceAll(":", "").toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(compact)) return null;
  return compact.match(/.{2}/g).join(":");
}

export function GET() {
  const fingerprint = normalizeFingerprint(
    signingCertificate.sha256_cert_fingerprint,
  );

  if (!fingerprint) {
    return Response.json(
      { error: "Android certificate fingerprint is not configured." },
      {
        status: 503,
        headers: NO_CACHE_HEADERS,
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
      headers: NO_CACHE_HEADERS,
    },
  );
}
