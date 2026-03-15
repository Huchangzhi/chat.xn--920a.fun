import { NextResponse } from "next/server";

export async function GET() {
  try {
    // 读取模型配置文件
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(process.cwd(), 'model.config');
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    return NextResponse.json(config);
  } catch (error) {
    console.error("Error loading model config:", error);
    // 返回默认配置
    const defaultConfig = {
      "qwen（推荐）": {
        "normal": [
          "qwen3-max-preview",
          "qwen3-max",
          "qwen3-235b-a22b-instruct"
        ],
        "coder": [
          "qwen3-coder-plus",
          "qwen3-coder",
          "qwen3-coder-flash"
        ],
        "think": [
          "qwen3.5-lts",
          "qwen3-think",
          "qwen3-235b-a22b-thinking-2507",
          "Qwen/QwQ-32B"
        ]
      },
      "glm": {
        "normal": [
          "glm-4-flash"
        ],
        "think": [
          "glm-5",
          "glm-4.7-flash",
          "glm-4.5-air"
        ]
      }
    };
    return NextResponse.json(defaultConfig);
  }
}