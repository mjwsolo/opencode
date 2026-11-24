import { TextAttributes } from "@opentui/core"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { createResource, createMemo, createSignal, Match, Switch } from "solid-js"
import { DIALOG_LIST_INSET, useDialog } from "../ui/dialog"
import { useTheme } from "../context/theme"
import { errorMessage } from "../util/error"
import { useData } from "../context/data"
import type { LocationRef } from "@opencode/client"
import { useConfig } from "../config"
import { useToast } from "../ui/toast"

export type DialogSkillProps = {
  location?: LocationRef
  onSelect: (skill: string) => void
}

/** Where a skill folder lives, from its path: project, user config, shared agents folder or other. */
export function skillSource(file: string) {
  const dir = file.replace(/\/SKILL\.md$/i, "")
  if (dir.includes("/.localcode-agent/skills/")) return "project"
  if (dir.includes("/localcode-agent/skills/")) return "user"
  if (dir.includes("/.agents/skills/")) return "shared (~/.agents)"
  return "other"
}

/** Rough token cost of a skill's description, which is what the model reads every turn while the skill is on. */
export function skillTokens(description: string | undefined) {
  return Math.ceil((description?.replace(/\s+/g, " ").trim().length ?? 0) / 4)
}

/** The list of skills that are off after toggling `id`. */
export function toggleDisabled(disabled: readonly string[], id: string) {
  return disabled.includes(id) ? disabled.filter((item) => item !== id) : [...disabled, id]
}

export function DialogSkill(props: DialogSkillProps) {
  const dialog = useDialog()
  const data = useData()
  const theme = useTheme()
  const config = useConfig()
  const toast = useToast()
  dialog.setSize("large")
  const disabled = () => config.data.session.disabled_skills ?? []
  const [saving, setSaving] = createSignal(false)
  const toggle = async (id: string) => {
    if (saving()) return
    setSaving(true)
    await config
      .update((draft) => {
        const session = (draft.session ??= {})
        const next = toggleDisabled(session.disabled_skills ?? [], id)
        session.disabled_skills = next.length === 0 ? undefined : next
      })
      .catch(toast.error)
      .finally(() => setSaving(false))
  }

  const [loadError, setLoadError] = createSignal<unknown>()

  const [skills] = createResource(() =>
    Promise.resolve()
      .then(async () => {
        const current = data.location.skill.list(props.location)
        if (current) return current
        await data.location.skill.sync(props.location)
        return data.location.skill.list(props.location) ?? []
      })
      // Catch so the rejected resource never reaches the memo below: reading
      // skills() in an errored state re-throws and tears down the dialog.
      .catch((error) => {
        setLoadError(error)
        return undefined
      }),
  )

  const showError = createMemo(() => Boolean(loadError()))

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    if (showError()) return []
    const list = skills() ?? []
    const maxWidth = Math.max(0, ...list.map((s) => s.name.length))
    const off = disabled()
    return list.map((skill) => ({
      title: `${off.includes(skill.id) ? "[ ]" : "[x]"} ${skill.name.padEnd(maxWidth)}`,
      description: skill.description?.replace(/\s+/g, " ").trim(),
      footer: `${skillSource(skill.path)} · ~${skillTokens(skill.description)} tok${
        skill.autoinvoke === false ? " · manual only" : ""
      }${off.includes(skill.id) ? " · off" : ""}`,
      value: skill.id,
      onSelect: () => {
        if (off.includes(skill.id)) {
          toast.show({ variant: "warning", title: "Skills", message: `${skill.name} is off (press space to turn it on)`, duration: 3000 })
          return
        }
        props.onSelect(skill.id)
        dialog.clear()
      },
    }))
  })

  return (
    <DialogSelect
      title="Skills"
      searchInTitle
      titlePlaceholder="Search skills"
      options={options()}
      preserveSelection
      actions={[
        {
          title: "on/off",
          command: "dialog.skill.toggle",
          onTrigger: (option) => void toggle(option.value as string),
        },
      ]}
      renderFilter={!showError() && !skills.loading}
      locked={showError() || skills.loading}
      emptyView={
        <Switch
          fallback={
            <box paddingLeft={DIALOG_LIST_INSET} paddingRight={DIALOG_LIST_INSET}>
              <text fg={theme.text.muted}>No skills available</text>
            </box>
          }
        >
          <Match when={showError()}>
            <box paddingLeft={DIALOG_LIST_INSET} paddingRight={DIALOG_LIST_INSET}>
              <text fg={theme.text.feedback.error.base} attributes={TextAttributes.BOLD}>
                Could not load skills
              </text>
              <text fg={theme.text.muted}>{errorMessage(loadError())}</text>
              <text fg={theme.text.muted}>Close and reopen Skills to try again.</text>
            </box>
          </Match>
          <Match when={skills.loading}>
            <box paddingLeft={DIALOG_LIST_INSET} paddingRight={DIALOG_LIST_INSET}>
              <text fg={theme.text.muted}>Loading skills…</text>
            </box>
          </Match>
        </Switch>
      }
      noMatchView={
        <box paddingLeft={DIALOG_LIST_INSET} paddingRight={DIALOG_LIST_INSET}>
          <text fg={theme.text.muted}>No skills found</text>
        </box>
      }
    />
  )
}
