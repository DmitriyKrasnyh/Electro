import { errorMessage } from "../lib/format"

interface LoadStatusProps {
  error: unknown
  onRetry: () => void
}

// Показывается, пока данных ещё нет: либо идёт загрузка, либо она не удалась.
export function LoadStatus({ error, onRetry }: LoadStatusProps) {
  if (!error) {
    return <p className="p-6 text-center text-gray-700">Загрузка…</p>
  }
  return (
    <div role="alert" className="space-y-3 border-2 border-red-700 bg-white p-4">
      <p className="font-semibold text-red-800">{errorMessage(error)}</p>
      <button type="button" className="btn w-full" onClick={onRetry}>
        Повторить
      </button>
    </div>
  )
}
