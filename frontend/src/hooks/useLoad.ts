import { useEffect, useState } from "react"
import { liveQuery } from "dexie"

// Читает данные из локальной базы при открытии экрана и при изменении deps.
// liveQuery сам повторяет чтение, когда эти данные меняются: после правки на экране,
// после синхронизации и даже в другой вкладке. Обновлять экран вручную не нужно.
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    setError(null)
    const subscription = liveQuery(load).subscribe({
      next: (result) => {
        setData(result)
        setError(null)
      },
      error: setError,
    })
    return () => subscription.unsubscribe()
  }, [...deps, version])

  return { data, error, reload: () => setVersion((value) => value + 1) }
}
