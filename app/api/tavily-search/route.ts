import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const tavilyApiKey = process.env.TAVILY_API_KEY;

  if (!tavilyApiKey) {
    return NextResponse.json(
      { error: "TAVILY_API_KEY is not set" },
      { status: 500 }
    );
  }

  try {
    const { query } = await request.json();

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${tavilyApiKey}`,
      },
      body: JSON.stringify({
        query,
        auto_parameters: true,
        topic: "general",
        search_depth: "basic",
        include_images: false,
        include_raw_content: false,
        max_results: 3,
        include_domains: [],
        exclude_domains: []
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Tavily API Error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in Tavily search API:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
