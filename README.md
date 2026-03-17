# OpenAI Chat Web

基于 OpenAI API 的 AI 聊天平台

## 部署

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FJazee6%2Fcloudflare-ai-web)

### Docker

```bash
docker run -d --name openai-chat-web \
  -e OPENAI_API_KEY=YOUR_OPENAI_API_KEY \
  -e OPENAI_BASE_URL=https://api.openai.com/v1 \
  -e TAVILY_API_KEY=YOUR_TAVILY_API_KEY \
  -e APP_PASSWORD=YOUR_PASSWORD \
  -p 3000:3000 \
  --restart=always \
  openai-chat-web
```

## 特性

- 支持 OpenAI 所有聊天模型
- 自动从 OpenAI API 获取模型列表
- 支持图像输入（多模态模型）
- 聊天记录本地存储
- 支持设置访问密码
- 集成Tavily搜索功能（可选）

## 环境变量列表

| 名称              | 描述                     | 必填 |
|------------------|-------------------------|-----|
| OPENAI_API_KEY   | OpenAI API 密钥          | 是   |
| OPENAI_BASE_URL  | OpenAI API 基础 URL      | 否   |
| TAVILY_API_KEY   | Tavily 搜索 API 密钥     | 否   |
| APP_PASSWORD     | 访问密码                 | 否   |

### OPENAI_BASE_URL

可选，默认为 `https://api.openai.com/v1`

如果你使用第三方 API 代理，可以设置此项，例如：
- `https://api.openai-proxy.com/v1`
- `https://your-proxy.com/v1`

### TAVILY_API_KEY

可选，用于启用搜索功能。获取地址：[https://app.tavily.com/](https://app.tavily.com/)

## 本地开发

```bash
# 安装依赖
bun install

# 创建环境变量文件
cp .env.example .env.local

# 编辑 .env.local 并设置 OPENAI_API_KEY 和 TAVILY_API_KEY

# 启动开发服务器
bun dev
```

## 搜索功能使用说明

1. 在输入框旁边有一个搜索图标按钮
2. 输入问题后，点击搜索按钮
3. 系统会先询问AI是否需要搜索，以及搜索什么内容
4. AI会返回JSON格式的决策：`{"search":"搜索内容"}` 或 `{"search":"no"}`
5. 如果需要搜索，系统会调用Tavily API获取结果，并将结果和原始问题一起发送给AI
6. AI基于搜索结果回答您的问题

## 构建

```bash
bun build
```
