import { getApplication } from "../../../lib/server/runtime.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request, context) {
  try {
    const { path } = await context.params;
    const application = await getApplication();
    return await application(request, path);
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
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
