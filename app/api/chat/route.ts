import { type NextRequest, NextResponse } from "next/server";
import { createParser } from "eventsource-parser";

interface Data {
  messages: {
    role: string;
    parts?: Array<{ type: string; text?: string }>;
  }[];
  model: string | string[];
  searchEnabled?: boolean;
}

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

function validateAndCleanMessages(messages: Data["messages"]) {
  return messages.map((message) => {
    let role: "system" | "user" | "assistant" = "user";

    if (["system", "user", "assistant"].includes(message.role)) {
      role = message.role as "system" | "user" | "assistant";
    } else {
      role = "user";
    }

    let content = "";
    if (Array.isArray(message.parts)) {
      content = message.parts
        .map((part) => {
          if ("text" in part && typeof part.text === "string") {
            return part.text;
          }
          return "";
        })
        .join("");
    }

    return {
      role,
      content,
    };
  });
}

async function callModel(
  model: string,
  apiKey: string,
  baseURL: string,
  messages: any[]
): Promise<Response> {
  const apiUrl = `${baseURL.endsWith("/v1") ? baseURL : `${baseURL}/v1`}/chat/completions`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Error: ${response.status} - ${errorBody}`);
  }

  if (!response.body) {
    throw new Error("Response body is empty");
  }

  return response;
}

async function processStream(
  response: Response,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  decoder: TextDecoder
): Promise<boolean> {
  const reader = response.body!.getReader();
  let hasContent = false;
  let streamError: Error | null = null;

  const parser = createParser({
    onEvent: (event) => {
      if (event.data === "[DONE]") {
        return;
      }

      try {
        const data = JSON.parse(event.data);

        if (data.error) {
          streamError = new Error(data.error.message || "API Error");
          return;
        }

        if (data.choices && data.choices.length > 0) {
          const choice = data.choices[0];
          const content =
            choice.delta?.content ?? choice.message?.content ?? "";

          if (content) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
            );
            hasContent = true;
          }
        }
      } catch (e) {
        streamError = e as Error;
      }
    },
    onError: (error) => {
      console.error("Parser error:", error);
      streamError = error;
    },
  });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const str = decoder.decode(value, { stream: true });
      parser.feed(str);
      if (streamError) {
        throw streamError;
      }
    }
  } catch (e) {
    console.error("Error reading stream:", e);
    throw e;
  } finally {
    reader.releaseLock();
  }
  return hasContent;
}

async function callModelForResponse(
  model: string,
  apiKey: string,
  baseURL: string,
  messages: any[]
): Promise<string> {
  const apiUrl = `${baseURL.endsWith("/v1") ? baseURL : `${baseURL}/v1`}/chat/completions`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Error: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callTavilySearch(query: string): Promise<any> {
  const tavilyApiKey = process.env.TAVILY_API_KEY;

  if (!tavilyApiKey) {
    throw new Error("TAVILY_API_KEY is not set");
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tavilyApiKey}`,
    },
    body: JSON.stringify({
      query,
      auto_parameters: true,
      topic: "general",
      search_depth: "advanced",
      include_images: false,
      include_raw_content: false,
      max_results: 5,
      include_domains: [],
      exclude_domains: [],
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Tavily API Error: ${response.status} - ${errorData}`);
  }

  return await response.json();
}

function extractJsonFromResponse(response: string): any | null {
  let searchStartIndex = response.lastIndexOf("{");
  while (searchStartIndex !== -1) {
    try {
      let braceCount = 0;
      let i = searchStartIndex;
      for (; i < response.length; i++) {
        if (response[i] === "{") {
          braceCount++;
        } else if (response[i] === "}") {
          braceCount--;
          if (braceCount === 0) {
            break;
          }
        }
      }

      if (braceCount === 0) {
        const jsonString = response.substring(searchStartIndex, i + 1);
        return JSON.parse(jsonString);
      }
    } catch (e) {
    }

    searchStartIndex = response.lastIndexOf("{", searchStartIndex - 1);
  }
  return null;
}



export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set" },
      { status: 500 }
    );
  }

  try {
    const { messages, model, searchEnabled } = (await request.json()) as Data;

    let cleanedMessages = validateAndCleanMessages(messages);
    const modelList = Array.isArray(model) ? model : [model];
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    if (searchEnabled && cleanedMessages.length > 0) {
      const lastUserMessage = cleanedMessages[cleanedMessages.length - 1];

      if (lastUserMessage.role === "user") {
        const searchDecisionMessages: Message[] = [
          {
            role: "system",
            content: "根据用户问题判断是否需要搜索。如果需要搜索，请输出格式：{\"search\":\"搜索查询内容\"}；如果不需要搜索，请输出：{\"search\":\"no\"}。只输出 JSON 格式，不要其他内容。搜索词请尽量拆分为关键词，例如：\"重庆 旅游推荐\"。"
          },
          {
            role: "user",
            content: lastUserMessage.content
          }
        ];

        try {
          const decisionModel = modelList[0];
          const decisionResponse = await callModelForResponse(
            decisionModel,
            apiKey,
            baseURL,
            searchDecisionMessages
          );

          const jsonResponse = extractJsonFromResponse(decisionResponse);

          if (jsonResponse && jsonResponse.search && jsonResponse.search !== "no") {
            const searchQuery = jsonResponse.search;

            const readableStream = new ReadableStream({
              async start(controller) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ searchStatus: "searching", searchQuery })}\n\n`)
                );

                try {
                  const searchData = await callTavilySearch(searchQuery);

                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ searchStatus: "complete", searchResults: searchData })}\n\n`)
                  );

                  const searchResults = searchData.results || [];
                  const searchContextParts = searchResults.map((result: any, index: number) => 
                    `[来源 ${index + 1}: ${result.title}](${result.url})\n${result.content}`
                  );
                  const searchContext = `请根据以下搜索结果回答问题，注意要使用用户的语言，不管材料的语言。每个来源都包含相关信息，请综合所有信息给出完整、详细的回答：\n\n${searchContextParts.join("\n\n")}\n\n原始问题：${lastUserMessage.content}`;

                  const modifiedMessages = [
                    ...cleanedMessages.slice(0, -1),
                    { role: "user" as const, content: searchContext }
                  ];

                  for (const modelItem of modelList) {
                    let retryCount = 0;
                    let success = false;

                    while (retryCount < 3 && !success) {
                      try {
                        const response = await callModel(modelItem, apiKey, baseURL, modifiedMessages);
                        const hasContent = await processStream(response, controller, encoder, decoder);

                        if (hasContent) {
                          success = true;
                        } else {
                          if (modelItem === modelList[0]) {
                            retryCount = 3;
                          } else {
                            retryCount++;
                            if (retryCount < 3) {
                              controller.enqueue(
                                encoder.encode(`data: ${JSON.stringify({ retry: `重试 ${retryCount}/3` })}\n\n`)
                              );
                            }
                          }
                        }
                      } catch (error) {
                        if (modelItem === modelList[modelList.length - 1] && retryCount >= 2) {
                          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `所有模型调用失败：${(error as Error).message}` })}\n\n`));
                          controller.close();
                          return;
                        }
                        retryCount++;
                        if (retryCount >= 3) throw error;
                      }
                    }

                    if (success) {
                      controller.close();
                      return;
                    }
                    if (modelItem === modelList[0] && !success) continue;
                  }
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "所有模型均返回空回复" })}\n\n`));
                  controller.close();
                } catch (searchError) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ searchStatus: "error", error: (searchError as Error).message })}\n\n`)
                  );

                  for (const modelItem of modelList) {
                    let retryCount = 0;
                    let success = false;

                    while (retryCount < 3 && !success) {
                      try {
                        const response = await callModel(modelItem, apiKey, baseURL, cleanedMessages);
                        const hasContent = await processStream(response, controller, encoder, decoder);

                        if (hasContent) {
                          success = true;
                        } else {
                          if (modelItem === modelList[0]) {
                            retryCount = 3;
                          } else {
                            retryCount++;
                            if (retryCount < 3) {
                              controller.enqueue(
                                encoder.encode(`data: ${JSON.stringify({ retry: `重试 ${retryCount}/3` })}\n\n`)
                              );
                            }
                          }
                        }
                      } catch (error) {
                        if (modelItem === modelList[modelList.length - 1] && retryCount >= 2) {
                          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `所有模型调用失败：${(error as Error).message}` })}\n\n`));
                          controller.close();
                          return;
                        }
                        retryCount++;
                        if (retryCount >= 3) throw error;
                      }
                    }

                    if (success) {
                      controller.close();
                      return;
                    }
                    if (modelItem === modelList[0] && !success) continue;
                  }
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "所有模型均返回空回复" })}\n\n`));
                  controller.close();
                }
              },
              cancel() {
                console.log("Stream cancelled");
              },
            });

            return new NextResponse(readableStream, {
              headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Transfer-Encoding": "chunked",
              },
            });
          }
        } catch (error) {
          console.error("Search decision error:", error);
        }
      }
    }

    const readableStream = new ReadableStream({
      async start(controller) {
        for (const modelItem of modelList) {
          let retryCount = 0;
          let success = false;

          while (retryCount < 3 && !success) {
            try {
              const response = await callModel(modelItem, apiKey, baseURL, cleanedMessages);
              const hasContent = await processStream(response, controller, encoder, decoder);

              if (hasContent) {
                success = true;
              } else {
                if (modelItem === modelList[0]) {
                  retryCount = 3;
                } else {
                  retryCount++;
                  if (retryCount < 3) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ retry: `重试 ${retryCount}/3` })}\n\n`)
                    );
                  }
                }
              }
            } catch (error) {
              if (modelItem === modelList[modelList.length - 1] && retryCount >= 2) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `所有模型调用失败：${(error as Error).message}` })}\n\n`));
                controller.close();
                return;
              }
              retryCount++;
              if (retryCount >= 3) throw error;
            }
          }

          if (success) {
            controller.close();
            return;
          }
          if (modelItem === modelList[0] && !success) continue;
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "所有模型均返回空回复" })}\n\n`));
        controller.close();
      },
      cancel() {
        console.log("Stream cancelled");
      },
    });

    return new NextResponse(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("Error in chat API:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}