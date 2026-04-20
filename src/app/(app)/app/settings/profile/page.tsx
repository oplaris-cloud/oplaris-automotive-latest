import { requireStaffSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/app/page-container";
import { AvatarUpload } from "./AvatarUpload";

export default async function ProfilePage() {
  const session = await requireStaffSession();
  const supabase = await createSupabaseServerClient();

  const { data: staff } = await supabase
    .from("staff")
    .select("full_name, avatar_url")
    .eq("id", session.userId)
    .single();

  return (
    <PageContainer width="form">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Update your profile picture. This is shown on the bay board and job assignments.
      </p>

      <div className="mt-6">
        <AvatarUpload
          currentUrl={(staff as { avatar_url?: string | null } | null)?.avatar_url ?? null}
          staffName={staff?.full_name ?? session.email}
        />
      </div>
    </PageContainer>
  );
}
