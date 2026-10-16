import { getApplication } from "../../../../lib/server/runtime.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const application = await getApplication();
    return await application(request, ["admin", "pin"]);
  } catch {
    return Response.json(
      {
        error:
          "Cloud database is not configured. Set DATABASE_URL on the server.",
      },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
      },
    );
  }
}
