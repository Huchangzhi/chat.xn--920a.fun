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

// 验证并清理消息，确保只有有效的角色
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
  messages: any[],
  controller: ReadableStreamDefaultController
) {
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
) {
  const reader = response.body!.getReader();
  const parser = createParser({
    onEvent: (event) => {
      if (event.data === "[DONE]") {
        controller.close();
        return;
      }

      try {
        const data = JSON.parse(event.data);

        if (data.error) {
          controller.error(new Error(data.error.message || "API Error"));
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
          }
        }
      } catch (e) {
        console.error("Error processing event:", e);
        controller.error(e);
      }
    },
    onError: (error) => {
      console.error("Parser error:", error);
      controller.error(error);
    },
  });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const str = decoder.decode(value, { stream: true });
      parser.feed(str);
    }
  } catch (e) {
    console.error("Error reading stream:", e);
    controller.error(e);
  } finally {
    reader.releaseLock();
  }
}

// 调用模型并返回完整响应（用于搜索判断）
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

// 调用 Tavily 搜索 API
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

// 从 AI 响应中提取 JSON
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
      // 解析失败，继续向前查找
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

    // 处理搜索逻辑
    if (searchEnabled && cleanedMessages.length > 0) {
      const lastUserMessage = cleanedMessages[cleanedMessages.length - 1];

      if (lastUserMessage.role === "user") {
        // 第一步：询问 AI 是否需要搜索
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
          // 获取第一个模型用于搜索判断
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

            // 发送搜索中状态给前端
            const readableStream = new ReadableStream({
              async start(controller) {
                // 发送搜索状态
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ searchStatus: "searching", searchQuery })}\n\n`)
                );

                try {
                  // 调用 Tavily 搜索
                  const searchData = await callTavilySearch(searchQuery);

                  // 发送搜索完成状态
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ searchStatus: "complete", searchResults: searchData })}\n\n`)
                  );

                  // 构建包含搜索结果的新消息 - 使用所有搜索结果
                  const searchResults = searchData.results || [];
                  const searchContextParts = searchResults.map((result: any, index: number) => 
                    `[来源 ${index + 1}: ${result.title}](${result.url})\n${result.content}`
                  );
                  const searchContext = `请根据以下搜索结果回答问题，注意要使用用户的语言，不管材料的语言。每个来源都包含相关信息，请综合所有信息给出完整、详细的回答：\n\n${searchContextParts.join("\n\n")}\n\n原始问题：${lastUserMessage.content}`;

                  // 替换最后一条用户消息
                  const modifiedMessages = [
                    ...cleanedMessages.slice(0, -1),
                    { role: "user" as const, content: searchContext }
                  ];

                  // 调用模型生成回答
                  for (const modelItem of modelList) {
                    try {
                      const response = await callModel(modelItem, apiKey, baseURL, modifiedMessages, controller);
                      await processStream(response, controller, encoder, decoder);
                      return;
                    } catch (error) {
                      if (modelItem === modelList[modelList.length - 1]) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `所有模型调用失败：${(error as Error).message}` })}\n\n`));
                        controller.close();
                        return;
                      }
                      continue;
                    }
                  }
                } catch (searchError) {
                  // 搜索失败，使用原始消息
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ searchStatus: "error", error: (searchError as Error).message })}\n\n`)
                  );

                  // 使用原始消息继续
                  for (const modelItem of modelList) {
                    try {
                      const response = await callModel(modelItem, apiKey, baseURL, cleanedMessages, controller);
                      await processStream(response, controller, encoder, decoder);
                      return;
                    } catch (error) {
                      if (modelItem === modelList[modelList.length - 1]) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `所有模型调用失败：${(error as Error).message}` })}\n\n`));
                        controller.close();
                        return;
                      }
                      continue;
                    }
                  }
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
          // 如果不需要搜索，继续普通聊天流程
        } catch (error) {
          console.error("Search decision error:", error);
          // 搜索判断失败，继续普通聊天流程
        }
      }
    }

    // 普通聊天流程
    const readableStream = new ReadableStream({
      async start(controller) {
        for (const modelItem of modelList) {
          try {
            const response = await callModel(modelItem, apiKey, baseURL, cleanedMessages, controller);
            await processStream(response, controller, encoder, decoder);
            return;
          } catch (error) {
            if (modelItem === modelList[modelList.length - 1]) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `所有模型调用失败：${(error as Error).message}` })}\n\n`));
              controller.close();
              return;
            }
            continue;
          }
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
  } catch (error) {
    console.error("Error in chat API:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
