import type { ReactNode } from "react"
import { useLoad } from "../hooks/useLoad"
import { getLastSyncTime } from "../lib/data"
import { requestSync, useSyncState } from "../lib/sync"

// На новом устройстве локальная база пуста. Пока данные не загрузились, главный экран
// показал бы одни нули, как будто задач нет. Дальше интернет для запуска не нужен.
export function FirstSyncGate({ children }: { children: ReactNode }) {
  const { data: lastSync } = useLoad(getLastSyncTime, [])
  const { online, syncing } = useSyncState()

  if (lastSync === null) return null // ещё читаем локальную базу
  if (lastSync !== "") return children

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center p-3">
      <div className="panel space-y-3">
        {online ? (
          <p className="font-semibold">Загружаем данные с сервера…</p>
        ) : (
          <>
            <p role="alert" className="font-semibold text-red-800">
              Нет связи с сервером. Для первого входа на этом устройстве нужен интернет.
            </p>
            <button type="button" className="btn w-full" disabled={syncing} onClick={() => void requestSync()}>
              Повторить
            </button>
          </>
        )}
      </div>
    </main>
  )
}
