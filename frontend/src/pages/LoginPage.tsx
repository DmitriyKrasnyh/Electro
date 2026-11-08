import { useState, type FormEvent } from "react"
import { Navigate, useNavigate } from "react-router"
import { isLoggedIn, login } from "../lib/auth"
import { errorMessage } from "../lib/format"
import { ServerError } from "../lib/supabase"

export default function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  if (isLoggedIn()) return <Navigate to="/" replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!username.trim() || !password) {
      setError("Введите логин и пароль.")
      return
    }

    setLoading(true)
    setError("")
    try {
      await login(username, password)
      navigate("/", { replace: true })
    } catch (loginError) {
      // Код 400 значит, что сервер ответил, но логин или пароль не подошли.
      const wrongCredentials = loginError instanceof ServerError && loginError.status === 400
      setError(wrongCredentials ? "Неверный логин или пароль." : errorMessage(loginError))
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center p-3">
      <div className="border-2 border-gray-950 bg-white">
        <div className="bg-gray-950 p-4 text-white">
          <h1 className="text-2xl font-bold">Электромонтаж</h1>
          <p className="text-base text-gray-300">Вход для бригады</p>
        </div>
        <form onSubmit={handleSubmit} noValidate className="space-y-4 p-4">
          <label className="block">
            <span className="label">Логин</span>
            <input
              className="field"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="label">Пароль</span>
            <input
              type="password"
              className="field"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="font-semibold text-red-800">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary w-full" disabled={loading}>
            {loading ? "Входим…" : "Войти"}
          </button>
        </form>
      </div>
    </main>
  )
}
