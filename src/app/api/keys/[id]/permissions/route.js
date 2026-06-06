import { NextResponse } from "next/server";
import { getApiKeyById, updatePermissions } from "@/lib/localDb";

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { permissions } = body;

    const existing = await getApiKeyById(id);
    if (!existing) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    const updated = await updatePermissions(id, permissions);
    if (!updated) {
      return NextResponse.json({ error: "Failed to update permissions" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error updating permissions:", error);
    return NextResponse.json({ error: "Failed to update permissions" }, { status: 500 });
  }
}
