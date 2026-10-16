import { notFound } from "next/navigation";
import ShareLanding from "../../../../components/ShareLanding";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Invitation — Reelbag",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function SharePage({ params }) {
  const { type, token } = await params;
  if (
    !["folder", "reel"].includes(type) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      token,
    )
  )
    notFound();
  return <ShareLanding type={type} token={token} />;
}
