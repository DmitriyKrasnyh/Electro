import { useState, type FormEvent, type ReactNode } from "react"
import { PageHeader } from "../components/PageHeader"
import { useLoad } from "../hooks/useLoad"
import { MIN_PASSWORD_LENGTH, changeOwnPassword, setUserPassword, useCurrentUser } from "../lib/auth"
import { getDirectories } from "../lib/data"
import { errorMessage } from "../lib/format"
import { ServerError } from "../lib/supabase"

// Смена пароля. Свой пароль меняет каждый, администратор ещё и задаёт пароль другим.
// Пароль хранится на сервере, поэтому здесь нужна связь.
export default function PasswordPage() {
  const user = useCurrentUser()
  // Пароль в перчатках легко набрать с ошибкой: его можно показать.
  const [showPasswords, setShowPasswords] = useState(false)
  const passwordType = showPasswords ? "text" : "password"

  return (
    <>
      <PageHeader title="Пароль" subtitle={user?.name} backTo="/" />
      <main className="page">
        <label className="flex min-h-14 items-center gap-3 font-semibold">
          <input
            type="checkbox"
            className="size-7 accent-gray-950"
            checked={showPasswords}
            onChange={(event) => setShowPasswords(event.target.checked)}
          />
          Показывать пароли
        </label>

        <OwnPasswordForm passwordType={passwordType} />
        {user?.is_admin && <CrewPasswordForm passwordType={passwordType} currentUserId={user.id} />}
      </main>
    </>
  )
}

// --- Свой пароль ---

function OwnPasswordForm({ passwordType }: { passwordType: string }) {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [repeat, setRepeat] = useState("")
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const problem = !current
      ? "Введите текущий пароль."
      : checkNewPassword(next) || (next !== repeat ? "Новый пароль и повтор не совпадают." : "")
    if (problem) {
      setResult({ ok: false, text: problem })
      return
    }

    setSaving(true)
    setResult(null)
    try {
      await changeOwnPassword(current, next)
      setCurrent("")
      setNext("")
      setRepeat("")
      setResult({ ok: true, text: "Пароль изменён. В следующий раз входите с новым паролем." })
    } catch (error) {
      setResult({ ok: false, text: ownPasswordError(error) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="panel space-y-4">
      <h2 className="panel-title">Мой пароль</h2>
      <PasswordField label="Текущий пароль" type={passwordType} value={current} onChange={setCurrent} autoComplete="current-password" />
      <PasswordField label="Новый пароль" type={passwordType} value={next} onChange={setNext} autoComplete="new-password" />
      <PasswordField label="Новый пароль ещё раз" type={passwordType} value={repeat} onChange={setRepeat} autoComplete="new-password" />
      <p className="text-base text-gray-700">Не короче {MIN_PASSWORD_LENGTH} символов.</p>
      <ResultMessage result={result} />
      <button type="submit" className="btn btn-primary w-full" disabled={saving}>
        {saving ? "Сохраняем…" : "Сменить пароль"}
      </button>
    </form>
  )
}

function ownPasswordError(error: unknown): string {
  if (error instanceof ServerError) {
    if (error.code === "invalid_credentials" || (error.status === 400 && !error.code)) return "Текущий пароль неверный."
    if (error.code === "same_password") return "Новый пароль совпадает с текущим."
    if (error.code === "weak_password") return "Пароль слишком простой. Придумайте другой."
  }
  return errorMessage(error)
}

// --- Пароль для другого человека (только администратор) ---

function CrewPasswordForm({ passwordType, currentUserId }: { passwordType: string; currentUserId: string }) {
  const { data: directories } = useLoad(getDirectories, [])
  // Свой пароль администратор меняет формой выше: там проверяется текущий пароль.
  const crew = (directories?.users ?? []).filter((person) => person.id !== currentUserId)
  const [userId, setUserId] = useState("")
  const [password, setPassword] = useState("")
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const person = crew.find((item) => item.id === userId)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const problem = !person ? "Выберите, кому задать пароль." : checkNewPassword(password)
    if (problem || !person) {
      setResult({ ok: false, text: problem })
      return
    }
    if (!window.confirm(`Задать новый пароль: ${person.name}? Старый перестанет работать.`)) return

    setSaving(true)
    setResult(null)
    try {
      await setUserPassword(person.id, password)
      setPassword("")
      setResult({
        ok: true,
        text: `Пароль для «${person.name}» задан. Сообщите его лично. На своих устройствах ему нужно войти заново.`,
      })
    } catch (error) {
      setResult({ ok: false, text: crewPasswordError(error) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="panel space-y-4">
      <h2 className="panel-title">Пароль для члена бригады</h2>
      <p className="text-base text-gray-700">Если кто-то забыл пароль, задайте ему новый.</p>
      <label className="block">
        <span className="label">Кому</span>
        <select className="field" value={userId} onChange={(event) => setUserId(event.target.value)}>
          <option value="">Выберите человека</option>
          {crew.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.username})
            </option>
          ))}
        </select>
      </label>
      <PasswordField label="Новый пароль" type={passwordType} value={password} onChange={setPassword} autoComplete="new-password" />
      <ResultMessage result={result} />
      <button type="submit" className="btn btn-primary w-full" disabled={saving}>
        {saving ? "Сохраняем…" : "Задать пароль"}
      </button>
    </form>
  )
}

function crewPasswordError(error: unknown): string {
  if (error instanceof ServerError) {
    if (error.code === "42501") return "Задавать пароли другим может только администратор."
    if (error.code === "22023") return `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.`
    if (error.code === "P0002") return "Такого пользователя на сервере уже нет."
  }
  return errorMessage(error)
}

// --- Общее ---

function checkNewPassword(password: string): string {
  return password.length < MIN_PASSWORD_LENGTH ? `Новый пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.` : ""
}

interface PasswordFieldProps {
  label: string
  type: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
}

function PasswordField({ label, type, value, onChange, autoComplete }: PasswordFieldProps) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        type={type}
        className="field"
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function ResultMessage({ result }: { result: { ok: boolean; text: string } | null }): ReactNode {
  if (!result) return null
  return result.ok ? (
    <p role="status" className="font-semibold text-green-800">
      {result.text}
    </p>
  ) : (
    <p role="alert" className="font-semibold text-red-800">
      {result.text}
    </p>
  )
}
