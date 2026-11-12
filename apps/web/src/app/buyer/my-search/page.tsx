import { Card } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import type { Preferences } from "@/lib/qualification";
import { createClient } from "@/lib/supabase/server";
import { clearPreferences } from "./actions";
import { PreferencesForm } from "./preferences-form";

export default async function MySearchPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("buyer_preferences")
    .select("budget_min_minor, budget_max_minor, areas, property_types, bedrooms_min, timeline, financing, must_haves, share_with_agents")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-[2.25rem] leading-tight font-medium">What are you looking for?</h1>
      <p className="mt-2 text-muted">
        Tell agents your budget, areas and timing once, so they can answer with listings that fit instead of asking again. Every field is optional.
      </p>
      <Card className="mt-7">
        <PreferencesForm p={(data as Preferences | null) ?? null} share={data?.share_with_agents ?? true} />
      </Card>
      {data ? (
        <form action={clearPreferences} className="mt-4">
          <SubmitButton variant="ghost" pendingText="Clearing…">
            Clear my answers
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
