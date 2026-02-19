import { NextResponse } from "next/server";
import { fetchOpenAIModels } from "@/lib/models";

export async function GET() {
  try {
    const models = await fetchOpenAIModels();
    return NextResponse.json(models);
  } catch (error) {
    console.error("Error fetching models:", error);
    return NextResponse.json([]);
  }
}
