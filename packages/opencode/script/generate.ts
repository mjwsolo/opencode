import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

const modelsUrl = process.env.OPENCODE_MODELS_URL || process.env.LOCALCODE_MODELS_URL
// localcode ships NO cloud model catalog: providers come from localcode.json only.
// Set MODELS_DEV_API_JSON (a file) or OPENCODE_MODELS_URL to embed one deliberately.
export const modelsData = process.env.MODELS_DEV_API_JSON
  ? await Bun.file(process.env.MODELS_DEV_API_JSON).text()
  : !modelsUrl
    ? "{}"
  : await fetch(`${modelsUrl}/api.json`).then((x) => x.text())
console.log(modelsData === "{}" ? "Embedding an empty model catalog (local providers only)" : "Loaded models.dev snapshot")
