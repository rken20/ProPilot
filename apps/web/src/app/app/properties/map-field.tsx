"use client";

import { useEffect, useState } from "react";
import { ListingMap } from "@/components/listing-map";
import { useSay } from "@/components/lang";
import { Field, Input } from "@/components/ui";
import { readPinInput } from "@/lib/map";

/**
 * The map on the property form: it follows the Location typed above, so the
 * seller sees what buyers will see, and takes an optional exact pin.
 */
export function MapField({
  values: v,
  errors: e,
  readOnly,
}: {
  values: Record<string, string>;
  errors: Record<string, string>;
  readOnly: boolean;
}) {
  const say = useSay();
  const [location, setLocation] = useState(v.location ?? "");
  const [pin, setPin] = useState(v.mapPin ?? "");
  // Wait until typing stops, so the map isn't reloaded on every letter.
  const [shown, setShown] = useState("");

  useEffect(() => {
    const el = document.getElementById("location") as HTMLInputElement | null;
    if (!el) return;
    const read = () => setLocation(el.value);
    read();
    el.addEventListener("input", read);
    return () => el.removeEventListener("input", read);
  }, []);

  const typed = readPinInput(pin);
  const query = typed.kind === "pin" ? typed.query : location.trim();
  useEffect(() => {
    const t = setTimeout(() => setShown(query.length >= 3 ? query : ""), 800);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <section className="space-y-3">
      {readOnly ? null : (
        <Field
          label="Exact map pin"
          htmlFor="mapPin"
          error={e.mapPin}
          hint={say(
            "Optional. Without it the map shows the location above. To pin the exact spot: in Google Maps, press and hold the spot, tap Share, and paste the link here. You can also type coordinates like 10.7202, 122.5621, or a landmark's name. Buyers will see this pin.",
            "Optional. Kapag wala, ang location sa taas ang ipapakita ng map. Para i-pin ang eksaktong lugar: sa Google Maps, i-press and hold ang lugar, i-tap ang Share, at i-paste ang link dito. Pwede ring mag-type ng coordinates gaya ng 10.7202, 122.5621, o pangalan ng landmark. Makikita ng buyers ang pin na ito.",
          )}
        >
          <Input
            id="mapPin"
            name="mapPin"
            value={pin}
            onChange={(ev) => setPin(ev.target.value)}
            maxLength={2000}
            autoComplete="off"
            placeholder="https://maps.app.goo.gl/…"
          />
        </Field>
      )}
      {shown ? (
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink">
            {say("Map buyers will see", "Map na makikita ng buyers")}
          </p>
          <ListingMap
            query={shown}
            title={say(
              "Map of this property's location",
              "Map ng location ng property na ito",
            )}
            shape="aspect-[16/10] sm:aspect-[16/7]"
          />
          {typed.kind === "short" ? (
            <p className="mt-1 text-xs text-muted">
              {say(
                "The map moves to your pasted link's spot after you save.",
                "Lilipat ang map sa lugar ng link na pinaste mo pagka-save.",
              )}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
