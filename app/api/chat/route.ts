import { type NextRequest, NextResponse } from "next/server";
import { createParser } from "eventsource-parser";

interface Data {
  messages: {
    role: string;
    parts?: Array<{ type: string; text?: string }>;
  }[];
  model: string | string[]; // 支持模型数组
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

async function callModel(model: string, apiKey: string, baseURL: string, messages: any[], controller: ReadableStreamDefaultController) {
  // 构建 API URL
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

async function processStream(response: Response, controller: ReadableStreamDefaultController, encoder: TextEncoder, decoder: TextDecoder) {
  const reader = response.body!.getReader();
  const parser = createParser({
    onEvent: (event) => {
      if (event.data === "[DONE]") {
        controller.close();
        return;
      }

      try {
        const data = JSON.parse(event.data);

        // 检查是否有错误
        if (data.error) {
          controller.error(new Error(data.error.message || "API Error"));
          return;
        }

        // 处理响应内容
        if (data.choices && data.choices.length > 0) {
          const choice = data.choices[0];
          const content =
            choice.delta?.content ?? choice.message?.content ?? "";

          if (content) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ content })}\n\n`),
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

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set" },
      { status: 500 },
    );
  }

  try {
    const { messages, model } = (await request.json()) as Data;

    const cleanedMessages = validateAndCleanMessages(messages);

    // 如果模型是一个数组（模型列表），按顺序尝试
    const modelList = Array.isArray(model) ? model : [model];

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        // 按顺序尝试模型列表
        for (const modelItem of modelList) {
          try {
            console.log(`尝试模型: ${modelItem}`);
            
            const response = await callModel(modelItem, apiKey, baseURL, cleanedMessages, controller);
            await processStream(response, controller, encoder, decoder);
            
            // 如果成功处理完流，则退出循环
            return;
          } catch (error) {
            console.error(`模型 ${modelItem} 调用失败:`, error);
            
            // 如果这是最后一个模型，则发送错误并关闭控制器
            if (modelItem === modelList[modelList.length - 1]) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `所有模型调用失败: ${(error as Error).message}` })}\n\n`));
              controller.close();
              return;
            }
            
            // 否则，继续尝试下一个模型
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
      { status: 500 },
    );
  }
}
