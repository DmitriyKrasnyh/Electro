import { useEffect, useState, type ReactNode } from "react"
import { Link } from "react-router"
import { useLoad } from "../hooks/useLoad"
import { getOutboxCounts } from "../lib/data"
import { changesWord, waitingText } from "../lib/format"
import { useSyncState } from "../lib/sync"

// Полоса под шапкой: сколько изменений ждут отправки и есть ли связь.
export function SyncIndicator() {
  const { data } = useLoad(getOutboxCounts, [])
  const { online } = useSyncState()
  const pending = data?.pending ?? 0
  const failed = data?.failed ?? 0

  // При хорошей связи правка уходит за доли секунды. Полоса в таком случае
  // только дёргала бы экран при каждом нажатии, поэтому показываем её с задержкой.
  const [slowSending, setSlowSending] = useState(false)
  useEffect(() => {
    if (pending === 0) {
      setSlowSending(false)
      return
    }
    const timer = setTimeout(() => setSlowSending(true), 2000)
    return () => clearTimeout(timer)
  }, [pending])

  if (failed > 0) {
    return (
      <Band>
        {failed} {changesWord(failed)} не удалось отправить
        {pending > 0 && ` · ещё ${waitingText(pending)}`}
      </Band>
    )
  }

  if (pending > 0 && (!online || slowSending)) {
    return <Band neutral>{online ? `Отправляем: ${waitingText(pending)}` : `Нет связи · ${waitingText(pending)}`}</Band>
  }

  if (!online) {
    return <p className="bg-gray-700 px-3 py-1 text-center text-sm text-white">Нет связи. Правки сохраняются на устройстве.</p>
  }

  return null
}

function Band({ neutral = false, children }: { neutral?: boolean; children: ReactNode }) {
  return (
    <Link
      to="/sync"
      className={`flex min-h-14 items-center justify-center px-3 py-2 text-center text-base leading-tight font-semibold text-white ${
        neutral ? "bg-gray-700 active:bg-gray-600" : "bg-red-700 active:bg-red-800"
      }`}
    >
      {children}
    </Link>
  )
}
