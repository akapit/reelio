import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { getRequestLocale } from "@/lib/i18n/server";

export default async function ProfilePage() {
  const supabase = await createClient();
  const locale = await getRequestLocale();
  const t = dictionaries[locale];

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "full_name, avatar_url, plan, headline, tagline, watermark_url, instagram_handle, tiktok_handle, youtube_handle",
    )
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div
      className="mx-auto flex flex-col"
      style={{ maxWidth: 1024, gap: 18, color: "var(--fg-0)", width: "100%" }}
    >
      <header style={{ marginBottom: 4 }}>
        <h1
          className="serif"
          style={{ fontSize: 28, margin: 0, letterSpacing: "-0.02em" }}
        >
          {t.profile.title}
        </h1>
        <p style={{ color: "var(--fg-3)", fontSize: 13, marginTop: 6 }}>
          {t.profile.subtitle}
        </p>
      </header>

      <ProfileEditor
        email={user.email ?? ""}
        plan={profile?.plan ?? null}
        initial={{
          full_name: profile?.full_name ?? "",
          headline: profile?.headline ?? "",
          tagline: profile?.tagline ?? "",
          avatar_url: profile?.avatar_url ?? "",
          watermark_url: profile?.watermark_url ?? "",
          instagram_handle: profile?.instagram_handle ?? "",
          tiktok_handle: profile?.tiktok_handle ?? "",
          youtube_handle: profile?.youtube_handle ?? "",
        }}
      />
    </div>
  );
}
