"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { AVATAR_BUCKET, avatarPath } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Point the profile at a photo the browser just uploaded to the person's own folder, and delete the old one. */
export async function setAvatar(fileId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!UUID.test(fileId))
    return { error: "Couldn't save the photo. Please try again." };
  const supabase = await createClient();
  const path = avatarPath(user.id, fileId.toLowerCase());
  const { data: before } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .single();
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_path: path, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) {
    await supabase.storage.from(AVATAR_BUCKET).remove([path]);
    return { error: "Couldn't save the photo. Please try again." };
  }
  if (before?.avatar_path && before.avatar_path !== path)
    await supabase.storage.from(AVATAR_BUCKET).remove([before.avatar_path]);
  revalidatePath("/app", "layout");
  return {};
}

/** Remove the profile photo and delete the file. */
export async function removeAvatar(): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: before } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .single();
  await supabase
    .from("profiles")
    .update({ avatar_path: null, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (before?.avatar_path)
    await supabase.storage.from(AVATAR_BUCKET).remove([before.avatar_path]);
  revalidatePath("/app", "layout");
}
