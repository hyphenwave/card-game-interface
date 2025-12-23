"use client"

import type { ReactNode } from "react"

import { RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CopyToClipboard } from "@/components/ui/copy-to-clipboard"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"

type SettingsPopoverProps = {
  trigger: ReactNode
  enforceRules: boolean
  setEnforceRules: (value: boolean) => void
  burnerAddress: string
  activeAddress: string
  isBurnerConnected: boolean
  onUseBurner: () => void
  onResetBurner: () => void
  onCopyBurner: () => void
  burnerPk: string
  setBurnerPk: (value: string) => void
  onImportBurner: () => void
  formatAddr: (addr: string) => string
}

export function SettingsPopover({
  trigger,
  enforceRules,
  setEnforceRules,
  burnerAddress,
  activeAddress,
  isBurnerConnected,
  onUseBurner,
  onResetBurner,
  onCopyBurner,
  burnerPk,
  setBurnerPk,
  onImportBurner,
  formatAddr,
}: SettingsPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <div className="rounded-md border bg-secondary/40 p-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-medium text-muted-foreground">Rules enforcement</div>
              <div className="text-xs text-muted-foreground">Block invalid plays in UI.</div>
            </div>
            <Switch checked={enforceRules} onCheckedChange={setEnforceRules} />
          </div>
        </div>
        <div className="text-sm font-medium">Burner wallet</div>
        <p className="text-xs text-muted-foreground">Stored locally for quick joins.</p>
        <div className="space-y-1 rounded-md border bg-secondary/40 p-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span>Burner: {formatAddr(burnerAddress)}</span>
            {burnerAddress ? <CopyToClipboard text={burnerAddress} /> : null}
          </div>
          <div className="text-muted-foreground">
            Active: {formatAddr(activeAddress || "") || "—"}
            {isBurnerConnected ? " (burner)" : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" className="flex-1" onClick={onUseBurner}>
            Use burner
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onResetBurner}
            title="Reset burner wallet"
          >
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={onCopyBurner}>
          Copy key
        </Button>
        <div className="space-y-1 pt-2">
          <div className="text-xs font-medium text-muted-foreground">Import private key</div>
          <div className="flex gap-2">
            <Input
              value={burnerPk}
              onChange={(e) => setBurnerPk(e.target.value)}
              placeholder="0x..."
              className="text-xs"
            />
            <Button size="sm" variant="outline" onClick={onImportBurner}>
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
