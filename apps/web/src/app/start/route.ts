import { NextResponse, type NextRequest } from "next/server";
import { getUser, homePathFor } from "@/lib/auth";

/** After sign-in: send buyers to browse and agents to their business. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  if (!(await getUser())) return NextResponse.redirect(new URL("/login", origin));
  return NextResponse.redirect(new URL(await homePathFor(), origin));
}
