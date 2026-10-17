/** Model switches wait for a complete turn, including tools and retries. */
export class ModelChangeQueue {
  private timer: ReturnType<typeof setInterval> | undefined

  cancel() {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  request(busy: () => boolean, change: () => void, interval = 250) {
    this.cancel()
    if (!busy()) {
      change()
      return false
    }
    this.timer = setInterval(() => {
      if (busy()) return
      this.cancel()
      change()
    }, interval)
    this.timer.unref?.()
    return true
  }
}
