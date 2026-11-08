import type { ReactNode } from "react"
import { useGoBack } from "../hooks/useGoBack"
import { ArrowLeftIcon } from "./icons"
import { SyncIndicator } from "./SyncIndicator"

interface PageHeaderProps {
  title: string
  subtitle?: string
  // Куда вернуться, если страницу открыли по прямой ссылке. Без него кнопки «Назад» нет.
  backTo?: string
  right?: ReactNode
}

export function PageHeader({ title, subtitle, backTo, right }: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-10 bg-gray-950 text-white">
      <div className="mx-auto flex min-h-18 max-w-3xl items-center gap-2 px-2 py-2">
        {backTo && <BackButton fallback={backTo} />}
        <div className="min-w-0 flex-1 px-1">
          <h1 className="line-clamp-2 text-xl leading-tight font-bold break-words">{title}</h1>
          {subtitle && <p className="truncate text-base leading-tight text-gray-300">{subtitle}</p>}
        </div>
        {right}
      </div>
      <SyncIndicator />
    </header>
  )
}

function BackButton({ fallback }: { fallback: string }) {
  const goBack = useGoBack(fallback)
  return (
    <button type="button" className="btn btn-header w-14 px-0" aria-label="Назад" onClick={goBack}>
      <ArrowLeftIcon />
    </button>
  )
}
