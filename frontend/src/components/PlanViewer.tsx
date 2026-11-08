import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react"
import { STATUS_STYLES } from "../lib/format"
import { STATUS_LABELS, type TaskStatus } from "../types"
import { FitScreenIcon, PlusIcon } from "./icons"

export interface PlanMarker {
  id: string
  x: number // проценты от ширины плана
  y: number // проценты от высоты плана
  title: string
  status: TaskStatus
  blocked: boolean
}

interface PlanViewerProps {
  imageUrl: string
  markers: PlanMarker[]
  selectedId: string | null
  draft: { x: number; y: number } | null // точка, которую ставят прямо сейчас
  focus: { x: number; y: number } | null // куда приблизиться при открытии
  // Без этого обработчика точки не нажимаются: нужно, когда ставят новую точку рядом с чужой.
  onTapMarker?: (id: string) => void
  onTapPlan: (x: number, y: number) => void
}

const MAX_ZOOM = 12 // во сколько раз можно увеличить план относительно размера «во весь экран»
const FOCUS_ZOOM = 3
const TAP_TOLERANCE = 10 // сдвиг пальца меньше этого в пикселях считается нажатием, а не перетаскиванием
const MARKER_HIT_RADIUS = 28 // радиус нажатия на точку: больше самой точки, чтобы попасть в перчатках
const PAN_MARGIN = 48 // на сколько план можно увести от края, чтобы углы не прятались под кнопками

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

// План с точками: перетаскивание, масштаб щипком, колесом мыши и кнопками.
// Положение меняем напрямую в стиле, без перерисовки React: так жест идёт плавно даже на слабом телефоне.
export function PlanViewer({ imageUrl, markers, selectedId, draft, focus, onTapMarker, onTapPlan }: PlanViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  const view = useRef({ x: 0, y: 0, scale: 1 })
  const fitted = useRef(true) // план показан во весь экран, пользователь его не двигал
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({ moved: false, startX: 0, startY: 0, distance: 0, centerX: 0, centerY: 0 })

  function containerSize() {
    return { width: containerRef.current?.clientWidth ?? 0, height: containerRef.current?.clientHeight ?? 0 }
  }

  function fitScale(): number {
    const box = containerSize()
    return size ? Math.min(box.width / size.width, box.height / size.height) : 1
  }

  function applyView(next: { x: number; y: number; scale: number }) {
    if (!size || !contentRef.current) return
    const box = containerSize()
    const fit = fitScale()
    const scale = clamp(next.scale, fit, fit * MAX_ZOOM)
    const width = size.width * scale
    const height = size.height * scale
    // Меньше экрана: по центру. Больше экрана: не даём совсем увести с него.
    const x = width <= box.width ? (box.width - width) / 2 : clamp(next.x, box.width - width - PAN_MARGIN, PAN_MARGIN)
    const y = height <= box.height ? (box.height - height) / 2 : clamp(next.y, box.height - height - PAN_MARGIN, PAN_MARGIN)

    view.current = { x, y, scale }
    contentRef.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
    // Точки остаются одного размера на экране при любом масштабе.
    contentRef.current.style.setProperty("--marker-scale", String(1 / scale))
  }

  function showWholePlan() {
    fitted.current = true
    applyView({ x: 0, y: 0, scale: fitScale() })
  }

  function zoomAround(centerX: number, centerY: number, factor: number) {
    fitted.current = false
    const { x, y, scale } = view.current
    const fit = fitScale()
    const target = clamp(scale * factor, fit, fit * MAX_ZOOM)
    const ratio = target / scale
    applyView({ x: centerX - (centerX - x) * ratio, y: centerY - (centerY - y) * ratio, scale: target })
  }

  function zoomWithButton(factor: number) {
    const box = containerSize()
    zoomAround(box.width / 2, box.height / 2, factor)
  }

  // Первый показ: весь план или приближение к нужной точке.
  // До отрисовки, иначе на мгновение мелькнёт огромный неуменьшенный план.
  useLayoutEffect(() => {
    if (!size) return
    if (focus) {
      fitted.current = false
      const box = containerSize()
      const scale = fitScale() * FOCUS_ZOOM
      applyView({
        x: box.width / 2 - (focus.x / 100) * size.width * scale,
        y: box.height / 2 - (focus.y / 100) * size.height * scale,
        scale,
      })
    } else {
      showWholePlan()
    }
  }, [size])

  // Экран повернули или изменилась нижняя панель: план должен остаться на месте.
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(() => {
      if (fitted.current) showWholePlan()
      else applyView(view.current)
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [size])

  function positionOf(event: { clientX: number; clientY: number }) {
    const rect = containerRef.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    const position = positionOf(event)
    pointers.current.set(event.pointerId, position)
    // Во время жеста план рисуется слоем видеокарты: двигается плавно, а после жеста снова становится чётким.
    if (contentRef.current) contentRef.current.style.willChange = "transform"

    if (pointers.current.size === 1) {
      gesture.current = { ...gesture.current, moved: false, startX: position.x, startY: position.y }
    } else {
      gesture.current.moved = true // второй палец: это уже не нажатие, а щипок
      rememberPinch()
    }
  }

  function rememberPinch() {
    const [a, b] = [...pointers.current.values()]
    gesture.current.distance = Math.hypot(a.x - b.x, a.y - b.y)
    gesture.current.centerX = (a.x + b.x) / 2
    gesture.current.centerY = (a.y + b.y) / 2
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    const position = positionOf(event)
    pointers.current.set(event.pointerId, position)

    if (pointers.current.size >= 2) {
      const { distance, centerX, centerY } = gesture.current
      rememberPinch()
      const current = gesture.current
      if (distance > 0) zoomAround(current.centerX, current.centerY, current.distance / distance)
      fitted.current = false
      applyView({
        ...view.current,
        x: view.current.x + current.centerX - centerX,
        y: view.current.y + current.centerY - centerY,
      })
      return
    }

    const moved = Math.hypot(position.x - gesture.current.startX, position.y - gesture.current.startY)
    if (moved > TAP_TOLERANCE) gesture.current.moved = true
    if (gesture.current.moved) {
      fitted.current = false
      applyView({
        ...view.current,
        x: view.current.x + position.x - previous.x,
        y: view.current.y + position.y - previous.y,
      })
    }
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.delete(event.pointerId)) return
    if (pointers.current.size > 0) return
    if (contentRef.current) contentRef.current.style.willChange = "auto"
    if (event.type === "pointerup" && !gesture.current.moved) handleTap(positionOf(event))
  }

  function handleTap(tap: { x: number; y: number }) {
    if (!size) return
    const { x, y, scale } = view.current

    // Ближайшая точка в пределах радиуса нажатия.
    if (onTapMarker) {
      let nearest: { id: string; distance: number } | null = null
      for (const marker of markers) {
        const markerX = x + (marker.x / 100) * size.width * scale
        const markerY = y + (marker.y / 100) * size.height * scale
        const distance = Math.hypot(tap.x - markerX, tap.y - markerY)
        if (distance <= MARKER_HIT_RADIUS && (!nearest || distance < nearest.distance)) {
          nearest = { id: marker.id, distance }
        }
      }
      if (nearest) {
        onTapMarker(nearest.id)
        return
      }
    }

    const percentX = ((tap.x - x) / scale / size.width) * 100
    const percentY = ((tap.y - y) / scale / size.height) * 100
    if (percentX < 0 || percentX > 100 || percentY < 0 || percentY > 100) return // нажали мимо листа
    // Не меньше 0,01: пара нулей означала бы, что точки нет.
    onTapPlan(clamp(Math.round(percentX * 100) / 100, 0.01, 100), clamp(Math.round(percentY * 100) / 100, 0.01, 100))
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    const position = positionOf(event)
    zoomAround(position.x, position.y, Math.exp(-event.deltaY * 0.002))
  }

  return (
    <>
      <div
        ref={containerRef}
        role="application"
        aria-label="План этажа"
        // touch-none: щипок и перетаскивание обрабатываем сами, браузер не должен масштабировать страницу.
        className="absolute inset-0 touch-none overflow-hidden select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onWheel={handleWheel}
      >
        <div
          ref={contentRef}
          className="absolute top-0 left-0 origin-top-left"
          style={size ? { width: size.width, height: size.height } : undefined}
        >
          <img
            src={imageUrl}
            alt="План этажа"
            draggable={false}
            onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            className={`pointer-events-none block max-w-none bg-white ${size ? "h-full w-full" : "invisible"}`}
          />
          {size &&
            markers.map((marker) => (
              // Нажатие считается в handleTap, а кнопка нужна для клавиатуры и программ чтения с экрана.
              <button
                key={marker.id}
                type="button"
                aria-label={`${marker.title}. ${STATUS_LABELS[marker.status]}${marker.blocked ? ", заблокировано" : ""}`}
                onClick={() => onTapMarker?.(marker.id)}
                style={{
                  left: `${marker.x}%`,
                  top: `${marker.y}%`,
                  transform: "translate(-50%, -50%) scale(var(--marker-scale, 1))",
                }}
                className={`pointer-events-none absolute block rounded-full border-2 border-white ${STATUS_STYLES[marker.status].bar} ${
                  marker.id === selectedId ? "z-10 h-10 w-10" : "h-7 w-7"
                } ${marker.blocked ? "ring-4 ring-red-600" : marker.id === selectedId ? "ring-4 ring-gray-950" : "ring-2 ring-gray-950"}`}
              />
            ))}
          {size && draft && (
            <span
              style={{
                left: `${draft.x}%`,
                top: `${draft.y}%`,
                transform: "translate(-50%, -50%) scale(var(--marker-scale, 1))",
              }}
              className="pointer-events-none absolute z-20 flex h-11 w-11 items-center justify-center rounded-full border-4 border-gray-950 bg-white text-gray-950"
            >
              <PlusIcon />
            </span>
          )}
        </div>
      </div>

      {/* Кнопки масштаба: щипком в перчатках работать трудно. В ряд внизу, а не столбиком
          сбоку: чертежи обычно горизонтальные, и на телефоне над и под ними есть свободное место. */}
      {size && (
        <div className="absolute right-2 bottom-2 z-10 flex gap-2">
          <button type="button" className="btn w-14 px-0" aria-label="Приблизить" onClick={() => zoomWithButton(1.6)}>
            <PlusIcon />
          </button>
          <button
            type="button"
            className="btn w-14 px-0 text-2xl"
            aria-label="Отдалить"
            onClick={() => zoomWithButton(1 / 1.6)}
          >
            −
          </button>
          <button type="button" className="btn w-14 px-0" aria-label="Показать весь план" onClick={showWholePlan}>
            <FitScreenIcon />
          </button>
        </div>
      )}
    </>
  )
}
