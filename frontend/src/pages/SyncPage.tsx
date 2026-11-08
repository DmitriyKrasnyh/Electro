import { LoadStatus } from "../components/LoadStatus"
import { PageHeader } from "../components/PageHeader"
import { useLoad } from "../hooks/useLoad"
import { getLastSyncTime, getOutbox } from "../lib/data"
import { formatDateTime } from "../lib/format"
import { discardOutboxItem, requestSync, retryOutboxItem, useSyncState } from "../lib/sync"

// Очередь отправки: что ещё не дошло до сервера и почему.
export default function SyncPage() {
  const { data: items, error, reload } = useLoad(getOutbox, [])
  const { data: lastSync } = useLoad(getLastSyncTime, [])
  const { online, syncing } = useSyncState()

  function handleDiscard(id: number) {
    if (window.confirm("Удалить это изменение? Оно не попадёт на сервер, отменить удаление нельзя.")) {
      void discardOutboxItem(id)
    }
  }

  return (
    <>
      <PageHeader title="Отправка изменений" backTo="/" />
      <main className="page">
        <section className="panel space-y-3">
          <div>
            <p className="font-semibold">{online ? "Связь с сервером есть" : "Нет связи с сервером"}</p>
            {lastSync && (
              <p className="text-base text-gray-700">Последняя синхронизация: {formatDateTime(lastSync)}</p>
            )}
          </div>
          <button type="button" className="btn w-full" disabled={syncing} onClick={() => void requestSync()}>
            {syncing ? "Синхронизируем…" : "Синхронизировать сейчас"}
          </button>
        </section>

        {!items ? (
          <LoadStatus error={error} onRetry={reload} />
        ) : items.length === 0 ? (
          <p className="text-gray-700">Все изменения отправлены.</p>
        ) : (
          <ol className="space-y-3">
            {items.map((item) => (
              <li key={item.id} className={`panel space-y-2 ${item.failed ? "border-red-700" : ""}`}>
                <p className="leading-snug font-semibold break-words">{item.label}</p>
                <p className="text-base text-gray-700">{formatDateTime(item.createdAt)}</p>
                {item.failed && (
                  <>
                    <p role="alert" className="font-semibold text-red-800">
                      {item.error}
                    </p>
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-danger" onClick={() => handleDiscard(item.id!)}>
                        Удалить
                      </button>
                      <button
                        type="button"
                        className="btn min-w-0 flex-1 px-2"
                        disabled={syncing}
                        onClick={() => void retryOutboxItem(item.id!)}
                      >
                        Повторить
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
      </main>
    </>
  )
}
