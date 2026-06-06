import { NextResponse } from "next/server";
import { getCombos } from "@/lib/localDb";

export async function GET() {
  try {
    const combos = await getCombos();
    const names = combos.map(c => c.name);
    return NextResponse.json({ combos: names });
  } catch (error) {
    console.log("Error fetching combos names:", error);
    return NextResponse.json({ error: "Failed to fetch combos names" }, { status: 500 });
  }
}
