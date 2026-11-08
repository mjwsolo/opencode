import { AmazonBedrockPlugin } from "./provider/amazon-bedrock.js"
import { AzurePlugin } from "./provider/azure.js"
import { CerebrasPlugin } from "./provider/cerebras.js"
import { ChatGPTPlugin } from "./provider/chatgpt.js"
import { ClaudeAgentPlugin } from "./provider/claude-agent/index.js"
import { CloudflareAIGatewayPlugin } from "./provider/cloudflare-ai-gateway.js"
import { CloudflareWorkersAIPlugin } from "./provider/cloudflare-workers-ai.js"
import { DatabricksPlugin } from "./provider/databricks.js"
import { DigitalOceanPlugin } from "./provider/digitalocean.js"
import { GithubCopilotPlugin } from "./provider/github-copilot.js"
import { GoogleVertexPlugin } from "./provider/google-vertex.js"
import { KiloPlugin } from "./provider/kilo.js"
import { LLMGatewayPlugin } from "./provider/llmgateway.js"
import { LMStudioPlugin } from "./provider/lmstudio.js"
import { ModalPlugin } from "./provider/modal.js"
import { NeonPlugin } from "./provider/neon.js"
import { NvidiaPlugin } from "./provider/nvidia.js"
import { OllamaPlugin } from "./provider/ollama.js"
import { OpenAIPlugin } from "./provider/openai.js"
import { OpenAIContextCapsPlugin } from "./provider/openai-context-caps.js"
import { SnowflakeCortexPlugin } from "./provider/snowflake-cortex.js"
import { OpenRouterPlugin } from "./provider/openrouter.js"
import { PromptCacheKeyPlugin } from "./provider/prompt-cache-key.js"
import { SapAICorePlugin } from "./provider/sap-ai-core.js"
import { VLLMPlugin } from "./provider/vllm.js"
import { XAIPlugin } from "./provider/xai.js"
import { ZenmuxPlugin } from "./provider/zenmux.js"
import type { PluginInternal } from "./internal.js"

// LocalCode drops the OpenCode Console/Zen provider (it served "free" cloud models with no
// configuration) and the GitLab and Poe account integrations.
export const ProviderPlugins: PluginInternal.InternalPlugin[] = [
  AmazonBedrockPlugin,
  AzurePlugin,
  CerebrasPlugin,
  ChatGPTPlugin,
  CloudflareAIGatewayPlugin,
  CloudflareWorkersAIPlugin,
  DatabricksPlugin,
  DigitalOceanPlugin,
  GithubCopilotPlugin,
  GoogleVertexPlugin,
  KiloPlugin,
  LLMGatewayPlugin,
  LMStudioPlugin,
  ModalPlugin,
  NeonPlugin,
  NvidiaPlugin,
  OllamaPlugin,
  SnowflakeCortexPlugin,
  OpenAIPlugin,
  OpenAIContextCapsPlugin,
  OpenRouterPlugin,
  PromptCacheKeyPlugin,
  SapAICorePlugin,
  VLLMPlugin,
  XAIPlugin,
  ZenmuxPlugin,
  ClaudeAgentPlugin,
]
