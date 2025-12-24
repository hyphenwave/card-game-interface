"use client"

import { useState } from "react"

import { WhotCard } from "@/components/whot-card"
import type { OwnedCard } from "@/lib/cards"

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const buildFanAngles = (count: number) => {
  if (count <= 1) return [0]
  const spread = Math.min(40, count * 8)
  const step = spread / (count - 1)
  const start = -spread / 2
  return Array.from({ length: count }, (_, idx) => start + step * idx)
}

export const CardFan = ({ count, faded = false }: { count: number; faded?: boolean }) => {
  const displayCount = clamp(count || 1, 1, 7)
  const angles = buildFanAngles(displayCount)
  return (
    <div className="relative h-20 w-32 sm:h-24 sm:w-40">
      {angles.map((angle, idx) => (
        <div
          key={`fan-${idx}`}
          className="absolute left-[42%] bottom-0 h-16 w-12 origin-bottom shadow-sm transition-all duration-300 hover:-translate-y-2 sm:h-20 sm:w-14"
          style={{
            transform: `translateX(-50%) rotate(${angle}deg) translateY(${Math.abs(angle) / 4}px)`,
            zIndex: idx,
          }}
        >
          <WhotCard variant="back" faded={faded} />
        </div>
      ))}
      {count > displayCount ? (
        <span className="absolute right-0 top-0 rounded-full bg-primary px-2 py-1 text-xs font-bold text-primary-foreground shadow-sm">
          +{count - displayCount}
        </span>
      ) : null}
    </div>
  )
}

export const HandFan = ({
  cards,
  canSelect,
  pendingIndex,
  actionLabel,
  open,
  onSelect,
}: {
  cards: OwnedCard[]
  canSelect: boolean
  pendingIndex: number | null
  actionLabel: string
  open: boolean
  onSelect: (index: number) => void
}) => {
  const [isHovered, setIsHovered] = useState(false)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null) // Array index, not card.index
  const isOpen = open || isHovered
  const angles = buildFanAngles(cards.length).map((angle) => angle * (isOpen ? 1.5 : 0.5))
  const mid = (cards.length - 1) / 2
  const spreadOpen = clamp(320 / Math.max(cards.length - 1, 1), 16, 36)
  const spreadClosed = clamp(180 / Math.max(cards.length - 1, 1), 10, 20)
  const spread = isOpen ? spreadOpen : spreadClosed

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = e.currentTarget
    const rect = container.getBoundingClientRect()
    const x = e.clientX - rect.left - rect.width / 2
    
    // Find which card the mouse is closest to based on x position
    let closestIdx = 0
    let closestDist = Infinity
    cards.forEach((_, idx) => {
      const cardX = (idx - mid) * spread
      const dist = Math.abs(x - cardX)
      if (dist < closestDist) {
        closestDist = dist
        closestIdx = idx
      }
    })
    
    // Only set if within reasonable range
    if (closestDist < 60) {
      setHoveredIdx(closestIdx)
    } else {
      setHoveredIdx(null)
    }
  }

  return (
    <div className="flex min-h-[160px] items-end justify-center overflow-visible pb-2 sm:min-h-[200px]">
      <div
        className="relative h-36 w-full max-w-2xl origin-bottom transition-all duration-500 ease-out sm:h-44 sm:max-w-3xl"
        onMouseEnter={() => setIsHovered(true)}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          setIsHovered(false)
          setHoveredIdx(null)
        }}
      >
        {cards.map((card, idx) => {
          const baseAngle = angles[idx] ?? 0
          const baseOffset = (idx - mid) * spread
          const isCardHovered = hoveredIdx === idx
          
          // Spread cards away from hovered card
          let spreadOffset = 0
          if (hoveredIdx !== null && hoveredIdx !== idx) {
            const diff = idx - hoveredIdx
            spreadOffset = diff > 0 ? 25 : -25
          }
          
          const rotate = isCardHovered ? 0 : (isOpen ? baseAngle : baseAngle * 0.3)
          const translateX = baseOffset + spreadOffset
          const translateY = isCardHovered ? -28 : (isOpen ? 0 : 6)
          const scale = isCardHovered ? 1.05 : (isOpen ? 1 : 0.92)
          
          return (
            <button
              key={`hand-${card.index}`}
              type="button"
              onClick={() => canSelect && onSelect(card.index)}
              title={canSelect ? `Commit ${actionLabel} with idx ${card.index}` : `Card #${card.index}`}
              className={`absolute left-1/2 bottom-0 h-28 w-[72px] origin-bottom rounded-lg overflow-hidden sm:h-32 sm:w-20 ${
                pendingIndex === card.index ? "ring-2 ring-primary ring-offset-2" : "ring-1 ring-border"
              } cursor-pointer ${isCardHovered ? "shadow-2xl shadow-black/30" : "shadow-lg shadow-black/10"}`}
              style={{
                transform: `translateX(calc(-50% + ${translateX}px)) rotate(${rotate}deg) translateY(${translateY}px) scale(${scale})`,
                zIndex: isCardHovered ? 100 : idx + 1,
                transition: 'transform 400ms cubic-bezier(0.25, 0.46, 0.45, 0.94), box-shadow 300ms ease-out',
              }}
            >
              <WhotCard variant="face" shape={card.shape} number={card.number} />
              <span className="pointer-events-none absolute right-1 top-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                #{card.index}
              </span>
              {isCardHovered && (
                <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-black/80 px-2 py-0.5 text-[10px] font-semibold text-white">
                  {actionLabel}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export const HandGrid = ({
  cards,
  canSelect,
  pendingIndex,
  actionLabel,
  onSelect,
}: {
  cards: OwnedCard[]
  canSelect: boolean
  pendingIndex: number | null
  actionLabel: string
  onSelect: (index: number) => void
}) => {
  return (
    <div className="grid gap-2 grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 max-w-2xl">
      {cards.map((card) => (
        <button
          key={`grid-${card.index}`}
          type="button"
          onClick={() => onSelect(card.index)}
          disabled={!canSelect}
          title={`Commit ${actionLabel} with idx ${card.index}`}
          className={`group relative rounded-lg transition-all duration-200 ${
            pendingIndex === card.index
              ? "ring-2 ring-primary ring-offset-2"
              : "ring-1 ring-border hover:ring-2 hover:ring-primary/50"
          } ${canSelect ? "cursor-pointer hover:-translate-y-1 hover:shadow-lg" : "cursor-not-allowed opacity-60"}`}
        >
          <WhotCard variant="face" shape={card.shape} number={card.number} />
          <span className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">
            #{card.index}
          </span>
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center rounded-b-lg bg-black/70 py-1 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
            {actionLabel}
          </span>
        </button>
      ))}
    </div>
  )
}

export type HandViewMode = "fan" | "grid"

export const HandViewToggle = ({
  mode,
  onChange,
}: {
  mode: HandViewMode
  onChange: (mode: HandViewMode) => void
}) => {
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-muted/50 p-0.5">
      <button
        type="button"
        onClick={() => onChange("grid")}
        className={`rounded-md p-1.5 transition-colors ${
          mode === "grid"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
        title="Grid view"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onChange("fan")}
        className={`rounded-md p-1.5 transition-colors ${
          mode === "fan"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
        title="Fan view"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 20 L8 4" />
          <path d="M10 20 L12 4" />
          <path d="M16 20 L16 4" />
          <path d="M20 20 L16 4" />
        </svg>
      </button>
    </div>
  )
}

export const MarketDeckFan = ({
  count,
  canDraw,
  isLoading,
  onDraw,
}: {
  count: number
  canDraw: boolean
  isLoading?: boolean
  onDraw: () => void
}) => {
  const displayCount = clamp(count || 1, 1, 5)
  const angles = buildFanAngles(displayCount).map((angle) => angle * 0.7)
  return (
    <button
      type="button"
      onClick={onDraw}
      disabled={!canDraw || isLoading}
      title={isLoading ? "Drawing..." : canDraw ? "Draw from market" : "Draw on your turn"}
      className={`group relative h-20 w-24 -translate-y-2 transition sm:h-24 sm:w-28 ${
        canDraw && !isLoading ? "cursor-pointer" : "cursor-not-allowed opacity-60"
      }`}
    >
      {angles.map((angle, idx) => (
        <div
          key={`market-${idx}`}
          className={`absolute left-1/2 bottom-0 h-16 w-12 origin-bottom shadow-sm transition-all duration-300 sm:h-20 sm:w-14 ${isLoading ? 'animate-pulse' : 'group-hover:-translate-y-1'}`}
          style={{
            transform: `translateX(-50%) rotate(${angle}deg) translateY(${Math.abs(angle) / 5}px)`,
            zIndex: idx,
          }}
        >
          <WhotCard variant="back" faded={!canDraw || isLoading} />
        </div>
      ))}

      {isLoading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 rounded-lg">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : null}

      {count > displayCount ? (
        <span className="absolute right-0 top-0 rounded-full bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground shadow-sm">
          +{count - displayCount}
        </span>
      ) : null}
    </button>
  )
}
