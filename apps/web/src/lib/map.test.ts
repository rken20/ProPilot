import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  coordinates,
  mapEmbedUrl,
  mapLink,
  mapQuery,
  pinFromMapLink,
  readPinInput,
} from "./map";
import { pinFromShortLink } from "./map-resolve";

describe("what the map shows", () => {
  it("is the seller's pin when there is one, else the listing's location", () => {
    expect(mapQuery({ location: " Jaro, Iloilo City ", map_query: null })).toBe(
      "Jaro, Iloilo City",
    );
    expect(
      mapQuery({
        location: "Jaro, Iloilo City",
        map_query: "10.720200,122.562100",
      }),
    ).toBe("10.720200,122.562100");
    expect(mapQuery({ location: "Jaro, Iloilo City", map_query: "  " })).toBe(
      "Jaro, Iloilo City",
    );
  });

  it("links and embeds with the place safely encoded", () => {
    expect(mapLink("Brgy. Lanag & Co, Pototan")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Brgy.%20Lanag%20%26%20Co%2C%20Pototan",
    );
    expect(mapEmbedUrl('x"><script>', null)).toBe(
      "https://www.google.com/maps?q=x%22%3E%3Cscript%3E&z=15&output=embed",
    );
    expect(
      mapEmbedUrl("Pototan", "AIzaSyA-1234567890abcdefghijklmnopqrstu"),
    ).toBe(
      "https://www.google.com/maps/embed/v1/place?key=AIzaSyA-1234567890abcdefghijklmnopqrstu&q=Pototan&zoom=15",
    );
    // A key that doesn't look like one is never put in an address.
    expect(mapEmbedUrl("Pototan", "bad key&x=1")).toContain("output=embed");
  });
});

describe("coordinates", () => {
  it("keeps places on Earth and nothing else", () => {
    expect(coordinates("10.7202", "122.5621")).toBe("10.720200,122.562100");
    expect(coordinates(-33.8, 151.2)).toBe("-33.800000,151.200000");
    expect(coordinates("91", "0")).toBeNull();
    expect(coordinates("0", "181")).toBeNull();
    expect(coordinates("abc", "1")).toBeNull();
  });
});

describe("reading a Google Maps link", () => {
  const pin = (href: string) => pinFromMapLink(new URL(href));

  it("takes the marker's coordinates over where the map was centered", () => {
    expect(
      pin(
        "https://www.google.com/maps/place/SM+City+Iloilo/@10.7139,122.5505,17z/data=!3m1!4b1!4m6!3m5!1s0x33aee5:0x1!8m2!3d10.7141234!4d122.5512345",
      ),
    ).toBe("10.714123,122.551235");
  });

  it("reads a dropped pin", () => {
    expect(pin("https://www.google.com/maps?q=10.7202,122.5621")).toBe(
      "10.720200,122.562100",
    );
    expect(pin("https://maps.google.com/?q=10.7202,+122.5621&ftid=abc")).toBe(
      "10.720200,122.562100",
    );
    expect(
      pin("https://www.google.com/maps/search/?api=1&query=10.7202%2C122.5621"),
    ).toBe("10.720200,122.562100");
    expect(
      pin("https://www.google.com/maps/place/10.7202,122.5621/data=!4m2"),
    ).toBe("10.720200,122.562100");
  });

  it("falls back to the place's name, then to the map's center", () => {
    expect(
      pin(
        "https://www.google.com/maps/place/Greenwoods+Executive+Village/data=!4m2!3m1!1s0x33ae:0x2?entry=gps",
      ),
    ).toBe("Greenwoods Executive Village");
    expect(
      pin("https://maps.google.com/?q=Sta.+Barbara+Plaza&ftid=0x1:0x2"),
    ).toBe("Sta. Barbara Plaza");
    expect(pin("https://www.google.com/maps/@10.7202,122.5621,15z")).toBe(
      "10.720200,122.562100",
    );
  });

  it("refuses links that aren't Google Maps", () => {
    expect(pin("https://www.google.com/search?q=10.7202,122.5621")).toBeNull();
    expect(pin("https://google.com.evil.example/maps?q=10.7,122.5")).toBeNull();
    expect(pin("http://www.google.com/maps?q=10.7,122.5")).toBeNull();
    expect(pin("https://www.google.com/maps")).toBeNull();
  });
});

describe("what a seller pastes", () => {
  it("is nothing, coordinates, a full link, a short link, or not usable", () => {
    expect(readPinInput("  ")).toEqual({ kind: "none" });
    expect(readPinInput("10.7202, 122.5621")).toEqual({
      kind: "pin",
      query: "10.720200,122.562100",
    });
    expect(readPinInput("95, 200")).toEqual({ kind: "bad" });
    expect(
      readPinInput(
        "Dropped pin https://www.google.com/maps?q=10.7202,122.5621 see you",
      ),
    ).toEqual({ kind: "pin", query: "10.720200,122.562100" });
    const short = readPinInput("https://maps.app.goo.gl/AbCdEf123");
    expect(short.kind === "short" && short.url.href).toBe(
      "https://maps.app.goo.gl/AbCdEf123",
    );
    expect(readPinInput("https://goo.gl/maps/AbCd").kind).toBe("short");
    expect(readPinInput("https://goo.gl/AbCd")).toEqual({ kind: "bad" });
    expect(readPinInput("SM City Iloilo")).toEqual({
      kind: "pin",
      query: "SM City Iloilo",
    });
    // What was saved from a link reads back the same way when the listing is edited.
    expect(readPinInput("10.714123,122.551235")).toEqual({
      kind: "pin",
      query: "10.714123,122.551235",
    });
    expect(readPinInput("Greenwoods Executive Village")).toEqual({
      kind: "pin",
      query: "Greenwoods Executive Village",
    });
    expect(readPinInput("10.7202")).toEqual({ kind: "bad" });
    expect(readPinInput("x")).toEqual({ kind: "bad" });
    expect(readPinInput("http://www.google.com/maps?q=10.7,122.5")).toEqual({
      kind: "bad",
    });
    expect(readPinInput("www.example.com")).toEqual({ kind: "bad" });
    expect(readPinInput("https://example.com/maps?q=10.7,122.5")).toEqual({
      kind: "bad",
    });
    expect(readPinInput("javascript:alert(1)")).toEqual({ kind: "bad" });
  });
});

describe("following a short link", () => {
  const redirect = (to: string | null, status = 302) =>
    new Response(null, { status, headers: to ? { location: to } : {} });
  const short = new URL("https://maps.app.goo.gl/AbCdEf123");

  it("reads the pin from where Google sends it, without opening that page", async () => {
    const fetchImpl = vi.fn<(href: string) => Promise<Response>>(async () =>
      redirect(
        "https://www.google.com/maps/place/House/@10.71,122.55,17z/data=!3d10.7141!4d122.5512",
      ),
    );
    expect(
      await pinFromShortLink(short, fetchImpl as unknown as typeof fetch),
    ).toBe("10.714100,122.551200");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "https://maps.app.goo.gl/AbCdEf123",
    );
  });

  it("follows one short link to another, and stops after four", async () => {
    const hops = vi.fn(async (href: string) =>
      href.endsWith("/one")
        ? redirect("https://goo.gl/maps/two")
        : redirect("https://maps.google.com/?q=10.7202,122.5621"),
    );
    expect(
      await pinFromShortLink(
        new URL("https://maps.app.goo.gl/one"),
        hops as unknown as typeof fetch,
      ),
    ).toBe("10.720200,122.562100");
    const loop = vi.fn(async () => redirect("https://maps.app.goo.gl/again"));
    expect(
      await pinFromShortLink(short, loop as unknown as typeof fetch),
    ).toBeNull();
    expect(loop).toHaveBeenCalledTimes(4);
  });

  it("never requests anything but Google's short-link hosts", async () => {
    const elsewhere = vi.fn(async () =>
      redirect("https://169.254.169.254/latest/meta-data"),
    );
    expect(
      await pinFromShortLink(short, elsewhere as unknown as typeof fetch),
    ).toBeNull();
    expect(elsewhere).toHaveBeenCalledTimes(1);
    const never = vi.fn();
    expect(
      await pinFromShortLink(
        new URL("https://example.com/x"),
        never as unknown as typeof fetch,
      ),
    ).toBeNull();
    expect(never).not.toHaveBeenCalled();
  });

  it("gives up quietly when the link is dead or Google can't be reached", async () => {
    expect(
      await pinFromShortLink(short, (async () =>
        redirect(null, 404)) as unknown as typeof fetch),
    ).toBeNull();
    expect(
      await pinFromShortLink(short, (async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch),
    ).toBeNull();
  });
});
