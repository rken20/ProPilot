import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailSuperAdmins } from "@/lib/billing-email";
import {
  fingerprint,
  payFirstWording,
  priceFarBelow,
  sameArea,
  sharedPhotos,
  type Finding,
} from "@/lib/listing-checks";
import { MEDIA_BUCKET } from "@/lib/media";
import { listsWithoutLicense } from "@/lib/seller-trust";
import { formatPeso } from "@/lib/money";
import { siteOrigin } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The app's own checks, run after a listing or a photo is saved (see
 * listing-checks.ts for the rules). A finding becomes a report for the app
 * admin and an email to them. Nothing here changes the listing, and a failure
 * here never fails the save: callers run these in after().
 */

const REASON_LABEL: Record<Finding["reason"], string> = {
  auto_price: "Price far below similar listings",
  auto_wording: "Wording asks for payment before a viewing or outside the app",
  auto_photos: "Same photos as another seller's listing",
  auto_license:
    "Listed by a broker, agent or developer without a licence number",
};

async function file(
  admin: SupabaseClient,
  property: { id: string; name: string },
  finding: Finding,
) {
  const { data: id, error } = await admin.rpc("report_listing", {
    p_property: property.id,
    p_source: "auto",
    p_reason: finding.reason,
    p_details: finding.details,
  });
  if (error) {
    console.error("[checks] report not filed:", error.message);
    return;
  }
  // Null: the same report is already open, or the admin already dismissed this exact finding.
  if (!id) return;
  await emailSuperAdmins(
    admin,
    `Listing to review: ${property.name}`,
    [
      ["Listing", property.name],
      ["Why", REASON_LABEL[finding.reason]],
      ["What the check saw", finding.details],
    ],
    {
      label: "Open Reports",
      url: `${siteOrigin() ?? "https://myhomeseller.ai"}/admin/reports`,
    },
  );
}

/** Wording and price, after a listing is created or edited. */
export async function checkListing(propertyId: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  try {
    const { data: p } = await admin
      .from("properties")
      .select(
        "id, business_id, name, type, location, price_minor, currency, status, description, financing, seller_capacity, seller_license",
      )
      .eq("id", propertyId)
      .maybeSingle();
    if (!p || (p.status !== "available" && p.status !== "reserved")) return;
    const listing = { id: p.id as string, name: p.name as string };
    const price = Number(p.price_minor);

    // No licence number from a broker, an agent or a developer: the admin looks at the listing, unless they already verified the seller.
    if (
      listsWithoutLicense(
        p.seller_capacity as string | null,
        p.seller_license as string | null,
      )
    ) {
      const { data: verified } = await admin
        .from("seller_verifications")
        .select("business_id")
        .eq("business_id", p.business_id as string)
        .maybeSingle();
      const as =
        p.seller_capacity === "agent"
          ? "an agent"
          : p.seller_capacity === "broker"
            ? "a broker"
            : "the developer";
      if (!verified)
        await file(admin, listing, {
          reason: "auto_license",
          details: `Listed as ${as} without a licence number. Check the seller, then mark them verified in Accounts or dismiss this.`,
        });
    }

    const notes = (p.financing as { notes?: unknown } | null)?.notes;
    const words = payFirstWording(
      [p.name, p.description, typeof notes === "string" ? notes : ""]
        .filter(Boolean)
        .join("\n"),
    );
    if (words)
      await file(admin, listing, {
        reason: "auto_wording",
        details: `The listing says: "${words}"`,
      });

    // Similar listings: the same type with a public page, in the same area, from any seller.
    const { data: peers } = await admin
      .from("properties")
      .select("id, location, price_minor")
      .eq("type", p.type as string)
      .eq("is_public", true)
      .in("status", ["available", "reserved"])
      .neq("id", propertyId)
      .order("created_at", { ascending: false })
      .limit(500);
    const prices = (peers ?? [])
      .filter((o) => sameArea(p.location as string, o.location as string))
      .map((o) => Number(o.price_minor));
    const low = priceFarBelow(price, prices);
    if (low) {
      const asked = formatPeso(price, (p.currency as string) ?? "PHP");
      await file(admin, listing, {
        reason: "auto_price",
        details:
          low.usual === null
            ? `The price is ${asked}, under ₱50,000.`
            : `The price is ${asked}: ${low.percent}% of the usual ${formatPeso(low.usual, "PHP")} across ${low.count} listings of the same type in the same area.`,
      });
    }
  } catch (e) {
    console.error(
      "[checks] listing check failed:",
      e instanceof Error ? e.message : String(e),
    );
  }
}

/** A picture's fingerprint, from the file. Null when it can't be read or has too little in it. */
export async function photoFingerprint(file: Buffer): Promise<string | null> {
  try {
    const gray = await sharp(file, {
      limitInputPixels: 60_000_000,
      failOn: "error",
    })
      .rotate()
      .greyscale()
      .resize(9, 8, { fit: "fill" })
      .raw()
      .toBuffer();
    return fingerprint(gray);
  } catch {
    return null;
  }
}

/**
 * After a photo is added: fingerprint it, then see whether this listing's
 * photos are also on another seller's listing.
 */
export async function checkPhoto(
  propertyId: string,
  storagePath: string,
): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  try {
    const { data: row } = await admin
      .from("property_media")
      .select("id, business_id, thumb_path, storage_path, photo_hash")
      .eq("property_id", propertyId)
      .eq("storage_path", storagePath)
      .maybeSingle();
    if (!row) return;
    if (!row.photo_hash) {
      // The small copy is enough for a 9 by 8 fingerprint, and quick to fetch.
      const { data: blob } = await admin.storage
        .from(MEDIA_BUCKET)
        .download((row.thumb_path ?? row.storage_path) as string);
      const hash = blob
        ? await photoFingerprint(Buffer.from(await blob.arrayBuffer()))
        : null;
      if (!hash) return;
      await admin
        .from("property_media")
        .update({ photo_hash: hash })
        .eq("id", row.id);
    }

    const { data: own } = await admin
      .from("property_media")
      .select("photo_hash")
      .eq("property_id", propertyId)
      .not("photo_hash", "is", null);
    const mine = (own ?? []).map((m) => m.photo_hash as string);
    if (mine.length < 2) return;
    // The newest photos of other sellers. Past this many, older ones aren't compared: move the search into the database before then.
    const { data: others } = await admin
      .from("property_media")
      .select("photo_hash, property_id")
      .neq("business_id", row.business_id as string)
      .not("photo_hash", "is", null)
      .order("created_at", { ascending: false })
      .limit(5000);
    const hit = sharedPhotos(
      mine,
      (others ?? []).map((o) => ({
        hash: o.photo_hash as string,
        property_id: o.property_id as string,
      })),
    )[0];
    if (!hit) return;

    const { data: both } = await admin
      .from("properties")
      .select("id, name, businesses(name)")
      .in("id", [propertyId, hit.property_id]);
    const me = both?.find((b) => b.id === propertyId);
    const other = both?.find((b) => b.id === hit.property_id);
    if (!me || !other) return;
    const seller =
      (other.businesses as unknown as { name: string } | null)?.name ??
      "another seller";
    await file(
      admin,
      { id: propertyId, name: me.name as string },
      {
        reason: "auto_photos",
        details: `${hit.shared} of its photos are also on "${other.name as string}" by ${seller} (/l/${hit.property_id}).`,
      },
    );
  } catch (e) {
    console.error(
      "[checks] photo check failed:",
      e instanceof Error ? e.message : String(e),
    );
  }
}
