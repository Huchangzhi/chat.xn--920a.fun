import { type NextRequest, NextResponse } from "next/server";
import { createParser } from "eventsource-parser";

interface Data {
  messages: {
    role: string;
    parts?: Array<{ type: string; text?: string }>;
  }[];
  model: string;
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
        messages: cleanedMessages,
        stream: true,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return NextResponse.json(
        { error: `Error: ${response.status} - ${errorBody}` },
        { status: response.status },
      );
    }

    if (!response.body) {
      return NextResponse.json(
        { error: "Response body is empty" },
        { status: 500 },
      );
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = response.body.getReader();

    const readableStream = new ReadableStream({
      async start(controller) {
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
      },
      cancel() {
        console.log("Stream cancelled");
        reader.releaseLock();
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
