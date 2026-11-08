import { useEffect, useState } from "react"
import { useLoad } from "../hooks/useLoad"
import { clearLocalData, db } from "./db"
import { AUTH_STORAGE_KEY, supabase, toServerError, unwrap } from "./supabase"
import { requestSync, waitForSyncToFinish } from "./sync"
import type { User } from "../types"

// Вход и выход. Библиотека Supabase сама хранит вход в браузере и продлевает его,
// поэтому после перезагрузки страницы вход повторять не нужно.

// Supabase требует email. Монтажники входят по логину, а адрес собирается из него:
// ivanov → ivanov@brigada.local. Такими адресами администратор и заводит пользователей.
export const LOGIN_EMAIL_DOMAIN = "brigada.local"

interface StoredSession {
  refresh_token?: string
  user?: { id: string; email?: string }
}

// Читаем вход прямо из хранилища браузера: так ответ есть сразу, без ожидания сети.
function readSession(): StoredSession | null {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? "null")
  } catch {
    return null
  }
}

function sessionUserId(): string {
  return readSession()?.user?.id ?? ""
}

// Срок входа здесь нарочно не проверяем: без связи приложение должно работать,
// даже если вход уже пора продлить. Когда связь появится, его проверит сервер (см. lib/sync.ts).
export function isLoggedIn(): boolean {
  return Boolean(readSession()?.refresh_token)
}

// ID вошедшего пользователя для записей, которые он создаёт.
export function currentUserId(): string {
  return sessionUserId()
}

// Текущий пользователь. Компонент перерисуется при входе и выходе.
// Имя берётся из профиля на устройстве, до первой загрузки показываем логин.
export function useCurrentUser(): User | null {
  const [userId, setUserId] = useState(sessionUserId)
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => setUserId(sessionUserId()))
    return () => data.subscription.unsubscribe()
  }, [])
  const { data: profile } = useLoad(() => db.users.get(userId), [userId])

  if (!userId) return null
  if (profile) return profile
  const username = (readSession()?.user?.email ?? "").split("@")[0]
  return { id: userId, username, name: username, created: "", updated: "" }
}

export async function login(username: string, password: string): Promise<void> {
  // Логин приводим к нижнему регистру: клавиатура телефона сама ставит заглавную букву.
  const email = `${username.trim().toLowerCase()}@${LOGIN_EMAIL_DOMAIN}`
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw toServerError(error)
  void requestSync()
}

// --- Пароли. Нужна связь с сервером: пароль хранится только там ---

export const MIN_PASSWORD_LENGTH = 8

// Смена своего пароля. Сначала проверяем текущий пароль новым входом: так чужой человек
// с телефона, на котором уже вошли, не сменит пароль владельца.
export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  const email = readSession()?.user?.email ?? ""
  const check = await supabase.auth.signInWithPassword({ email, password: currentPassword })
  if (check.error) throw toServerError(check.error)
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw toServerError(error)
}

// Администратор задаёт новый пароль другому человеку из бригады. Права проверяет сервер.
// Все входы этого человека сбрасываются, на своих устройствах он входит заново.
export async function setUserPassword(userId: string, newPassword: string): Promise<void> {
  unwrap(await supabase.rpc("admin_set_password", { target: userId, new_password: newPassword }))
}

// Сервер больше не принимает этот вход (пароль сменили, пользователя удалили).
// Данные на устройстве не стираем: после нового входа очередь отправится.
export async function forgetSession(): Promise<void> {
  await supabase.auth.signOut({ scope: "local" })
}

// Выход стирает данные с устройства, поэтому при неотправленных изменениях он запрещён:
// иначе они пропали бы. Возвращает их количество, 0 значит, что выход выполнен.
export async function logout(): Promise<number> {
  const unsent = await db.outbox.count()
  if (unsent > 0) return unsent
  await waitForSyncToFinish()
  // Вход на устройстве стирается сразу, даже без связи.
  await supabase.auth.signOut({ scope: "local" })
  await clearLocalData()
  return 0
}
