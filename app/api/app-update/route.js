import { NextResponse } from "next/server";

export const revalidate = 300;

export async function GET() {
  try {
    const response = await fetch(
      "https://github.com/chick-wasabi/Reelbag/releases/latest",
      { redirect: "manual", next: { revalidate: 300 } },
    );
    const location = response.headers.get("location") || "";
    const tag = decodeURIComponent(location.split("/tag/")[1] || "");
    const build = Number(tag.match(/android-native-(\d+)$/)?.[1]);
    if (!Number.isInteger(build)) throw new Error("No Android release found");
    return NextResponse.json({
      build,
      tag,
      downloadUrl:
        "https://github.com/chick-wasabi/Reelbag/releases/latest/download/Reelbag-Native-App.apk",
    });
  } catch {
    return NextResponse.json(
      { error: "The Android update service is temporarily unavailable." },
      { status: 503 },
    );
  }
}
