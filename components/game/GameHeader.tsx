"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CustomConnectButton } from "@/components/custom-connect-button"

type GameHeaderProps = {
  viewMode: "tech" | "fun"
  onViewChange: (mode: "tech" | "fun") => void
  gameId: bigint
  isMounted: boolean
}

export function GameHeader({ viewMode, onViewChange, gameId, isMounted }: GameHeaderProps) {
  return (
    <div
      className={`flex items-center justify-between gap-3 ${
        viewMode === "fun"
          ? "flex-col items-start sm:flex-row sm:items-center sm:justify-between"
          : "flex-wrap"
      }`}
    >
      <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to lobby
      </Link>
      <div
        className={`flex items-center gap-2 ${
          viewMode === "fun"
            ? "w-full flex-nowrap overflow-x-auto pb-1 sm:w-auto sm:flex-wrap sm:overflow-visible sm:pb-0"
            : "flex-wrap"
        }`}
      >
        {isMounted ? <CustomConnectButton /> : null}
        <div className="flex rounded-full border bg-secondary/60 p-1">
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={viewMode === "tech"}
            className={`rounded-full px-4 text-xs font-semibold transition ${
              viewMode === "tech"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => onViewChange("tech")}
          >
            Tech
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={viewMode === "fun"}
            className={`rounded-full px-4 text-xs font-semibold transition ${
              viewMode === "fun"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => onViewChange("fun")}
          >
            Fun
          </Button>
        </div>
        <Badge variant="outline">Game #{gameId.toString()}</Badge>
      </div>
    </div>
  )
}
