import { NextResponse } from "next/server";
import { getApiKeyById, getComboByName } from "@/lib/localDb";
import { checkPermission } from "@/lib/auth/apiKeyPermissions";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const model = searchParams.get("model");

    if (!model) {
      return NextResponse.json({ error: "Missing model query parameter" }, { status: 400 });
    }

    const keyInfo = await getApiKeyById(id);
    if (!keyInfo) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    const isCombo = !!(await getComboByName(model));
    const kind = isCombo ? "combo" : "model";

    const check = checkPermission(keyInfo.permissions, kind, model);

    return NextResponse.json({
      allowed: check.allowed,
      reason: check.reason || null,
      code: check.code || null,
      kind,
      model,
    });
  } catch (error) {
    console.log("Error testing key access:", error);
    return NextResponse.json({ error: "Failed to test key access" }, { status: 500 });
  }
}
