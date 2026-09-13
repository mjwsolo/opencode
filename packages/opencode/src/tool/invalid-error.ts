/** Parser errors can embed the entire rejected generation, including repetition. */
export function invalidToolError(error: string) {
  if (error.length <= 1500) return error
  const detail = error.match(/Error message: ([\s\S]*)$/)?.[1]?.slice(0, 500)
  return `${error.slice(0, 1000)}… [rejected arguments omitted]${detail ? `\n${detail}` : ""}\nThe tool did not run. Retry with valid JSON and only the required fields. Split large writes into small files or separate edits; do not repeat the rejected payload.`
}
