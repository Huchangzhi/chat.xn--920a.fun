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

## 环境变量列表

| 名称              | 描述                     | 必填 |
|------------------|-------------------------|-----|
| OPENAI_API_KEY   | OpenAI API 密钥          | 是   |
| OPENAI_BASE_URL  | OpenAI API 基础 URL      | 否   |
| APP_PASSWORD     | 访问密码                 | 否   |

### OPENAI_BASE_URL

可选，默认为 `https://api.openai.com/v1`

如果你使用第三方 API 代理，可以设置此项，例如：
- `https://api.openai-proxy.com/v1`
- `https://your-proxy.com/v1`

## 本地开发

```bash
# 安装依赖
bun install

# 创建环境变量文件
cp .env.example .env.local

# 编辑 .env.local 并设置 OPENAI_API_KEY

# 启动开发服务器
bun dev
```

## 构建

```bash
bun build
```
