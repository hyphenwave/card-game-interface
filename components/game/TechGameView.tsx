"use client"

import { Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { CARD_SHAPES, describeCard, marketSize, type OwnedCard } from "@/lib/cards"
import type { GameData, PlayerRow } from "@/components/game/types"

type ActionOption = { value: number; label: string }

type TechGameViewProps = {
  loadingGame: boolean
  gameData: GameData | null
  callCardDisplay: number
  isMyTurn: boolean
  joinHandler: () => void
  startHandler: () => void
  joinDisabled: boolean
  joinBusy: boolean
  startDisabled: boolean
  startBusy: boolean
  relayerEnabled: boolean
  setRelayerEnabled: (value: boolean) => void
  relayerAddress: string
  gameStarted: boolean
  handleRevealHand: () => void
  canRevealHand: boolean
  isRevealingHand: boolean
  handStale: boolean
  revealBlockReason: string | null
  handUpdatedAt: number | null
  handError: string | null
  myHand: OwnedCard[] | null
  me?: PlayerRow
  players: PlayerRow[]
  loadingPlayers: boolean
  zeroAddress: string
  mustResolvePending: boolean
  pendingPickCount: number
  handleResolvePending: () => void
  canResolvePending: boolean
  action: number
  setAction: (value: number) => void
  cardIndex: string
  setCardIndex: (value: string) => void
  shouldShowWishShape: boolean
  wishShape: string
  setWishShape: (value: string) => void
  pendingCommitStatus: string
  needsCommit: boolean
  isConnected: boolean
  canPlayTurn: boolean
  commitPending: boolean
  isDecrypting: boolean
  fheStatus: string
  hasPendingCommit: boolean
  pendingProofData: `0x${string}` | null
  executePending: boolean
  breakPending: boolean
  handleCommit: (indexOverride?: bigint, actionOverride?: number) => void
  handleExecute: (actionOverride?: number) => void
  handleBreakCommitment: () => void
  handleForfeit: () => void
  canForfeit: boolean
  forfeitPending: boolean
  bootTarget: string
  setBootTarget: (value: string) => void
  handleBoot: () => void
  bootPending: boolean
  actions: readonly ActionOption[]
  formatAddr: (addr: string) => string
}

export function TechGameView({
  loadingGame,
  gameData,
  callCardDisplay,
  isMyTurn,
  joinHandler,
  startHandler,
  joinDisabled,
  joinBusy,
  startDisabled,
  startBusy,
  relayerEnabled,
  setRelayerEnabled,
  relayerAddress,
  gameStarted,
  handleRevealHand,
  canRevealHand,
  isRevealingHand,
  handStale,
  revealBlockReason,
  handUpdatedAt,
  handError,
  myHand,
  me,
  players,
  loadingPlayers,
  zeroAddress,
  mustResolvePending,
  pendingPickCount,
  handleResolvePending,
  canResolvePending,
  action,
  setAction,
  cardIndex,
  setCardIndex,
  shouldShowWishShape,
  wishShape,
  setWishShape,
  pendingCommitStatus,
  needsCommit,
  isConnected,
  canPlayTurn,
  commitPending,
  isDecrypting,
  fheStatus,
  hasPendingCommit,
  pendingProofData,
  executePending,
  breakPending,
  handleCommit,
  handleExecute,
  handleBreakCommitment,
  handleForfeit,
  canForfeit,
  forfeitPending,
  bootTarget,
  setBootTarget,
  handleBoot,
  bootPending,
  actions,
  formatAddr,
}: TechGameViewProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Game overview</CardTitle>
          <CardDescription>
            Creator {formatAddr(gameData?.gameCreator ?? "")} • Ruleset {formatAddr(gameData?.ruleset ?? "")} • Seats {gameData?.playersJoined}/{gameData?.maxPlayers}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingGame ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading game data...
            </div>
          ) : gameData ? (
            <>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Badge variant="secondary">
                  Call card: {callCardDisplay ? describeCard(callCardDisplay) : "No call card yet"}
                </Badge>
                <Badge variant="secondary">Turn: {gameData.playerTurnIdx}</Badge>
                <Badge variant="outline">
                  Status: {["Open", "Started", "Ended"][gameData.status] ?? "Unknown"}
                </Badge>
                <Badge variant="outline">Market: {marketSize(gameData.marketDeckMap)}</Badge>
                {isMyTurn ? <Badge>My turn</Badge> : null}
              </div>
              {gameData.status === 0 ? (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={joinHandler} disabled={joinDisabled}>
                        {joinBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Join game
                      </Button>
                      <Button variant="secondary" onClick={startHandler} disabled={startDisabled}>
                        {startBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Start game
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Start via relayer</span>
                      <Switch checked={relayerEnabled} onCheckedChange={setRelayerEnabled} />
                      <span>{relayerEnabled ? "Relayer pays gas" : "Wallet pays gas"}</span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {relayerEnabled
                      ? `Relayer: ${formatAddr(relayerAddress)} (start only)`
                      : "Relayer disabled. Use your wallet to start."}
                  </div>
                </>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Commit triggers decryption. Execute uses the generated proof for Play/Defend actions.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No game data found.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your hand</CardTitle>
          <CardDescription>Decrypt to view your cards. Only you can see them.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-lg bg-secondary px-3 py-2 text-sm font-medium">
              Call card: {gameData ? (callCardDisplay ? describeCard(callCardDisplay) : "No call card yet (any card can be played)") : "—"}
            </div>
            <Button onClick={handleRevealHand} disabled={!canRevealHand || isRevealingHand}>
              {isRevealingHand ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {myHand?.length ? "Refresh hand" : "Reveal hand"}
            </Button>
            {handStale ? <span className="text-xs text-muted-foreground">Hand changed. Reveal again.</span> : null}
            {!canRevealHand && revealBlockReason ? (
              <span className="text-xs text-muted-foreground">{revealBlockReason}</span>
            ) : null}
            {handUpdatedAt ? (
              <span className="text-xs text-muted-foreground">
                Updated {new Date(handUpdatedAt).toLocaleTimeString()}
              </span>
            ) : null}
          </div>
          {!isConnected ? (
            <p className="text-xs text-muted-foreground">Connect a wallet to decrypt your cards.</p>
          ) : fheStatus !== "ready" ? (
            <p className="text-xs text-muted-foreground">FHE relayer is {fheStatus}. Try again shortly.</p>
          ) : null}
          {handError ? <p className="text-xs text-destructive">{handError}</p> : null}
          {!gameStarted ? (
            <p className="text-xs text-muted-foreground">Start the game to receive cards.</p>
          ) : !me ? (
            <p className="text-xs text-muted-foreground">Join the game to view your hand.</p>
          ) : myHand?.length ? (
            <div className="flex flex-wrap gap-2">
              {myHand.map((card) => (
                <Badge key={card.index} variant="secondary">
                  {card.label} · idx {card.index}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Decrypt to see your cards and their indexes.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Players</CardTitle>
          <CardDescription>Hand indexes are derived from deckMap bits; cards stay encrypted.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingPlayers ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading players...
            </div>
          ) : (
            players.map((p) => (
              <div key={p.index} className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Badge variant="outline">#{p.index}</Badge>
                    <span className="font-medium break-all text-xs sm:break-normal sm:text-sm">
                      {p.addr.toLowerCase() === zeroAddress ? "Empty slot" : p.addr}
                    </span>
                    {p.forfeited ? <Badge variant="destructive">Forfeited</Badge> : null}
                    {me?.index === p.index ? <Badge>Me</Badge> : null}
                  </div>
                  <div className="text-muted-foreground text-xs">Score {p.score}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.cards.length ? (
                    p.cards.map((idx) => (
                      <Badge key={idx} variant="secondary">
                        idx {idx}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">Empty hand</span>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Turn controls</CardTitle>
          <CardDescription>Commit first, then execute. Whot wishes appear only when you play a Whot card.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {mustResolvePending ? (
            <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs">
              <div className="font-semibold text-foreground">Pending pick {pendingPickCount}</div>
              <div className="text-muted-foreground">Resolve your pending draw before other actions.</div>
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={handleResolvePending}
                disabled={!canResolvePending}
              >
                Pick {pendingPickCount}
              </Button>
            </div>
          ) : null}
          <div className={`grid gap-3 ${shouldShowWishShape ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Action</label>
              <Select value={action.toString()} onValueChange={(val) => setAction(Number(val))} disabled={mustResolvePending}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {actions.map((act) => (
                    <SelectItem key={act.value} value={act.value.toString()}>
                      {act.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Card index (from your hand map)</label>
              <Input
                value={cardIndex}
                onChange={(e) => setCardIndex(e.target.value)}
                placeholder="e.g. 12"
                disabled={mustResolvePending}
              />
            </div>
            {shouldShowWishShape ? (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Whot wish shape</label>
                <Select value={wishShape} onValueChange={setWishShape}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CARD_SHAPES.map((shape, idx) => (
                      <SelectItem key={shape} value={idx.toString()}>
                        {shape}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <div className="rounded-md border bg-secondary/50 p-2 text-xs text-muted-foreground">
            {pendingCommitStatus}
          </div>
          {fheStatus !== "ready" ? (
            <div className="text-xs text-muted-foreground">
              FHE relayer is {fheStatus}. Connect a wallet to enable decrypt.
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleCommit}
              disabled={
                !isConnected ||
                !canPlayTurn ||
                !needsCommit ||
                commitPending ||
                isDecrypting ||
                fheStatus !== "ready" ||
                hasPendingCommit ||
                mustResolvePending
              }
            >
              {commitPending || isDecrypting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Commit & decrypt
            </Button>
            <Button
              variant="secondary"
              onClick={handleExecute}
              disabled={!isConnected || !canPlayTurn || executePending || (needsCommit && !pendingProofData)}
            >
              {executePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Execute move
            </Button>
            <Button
              variant="outline"
              onClick={handleBreakCommitment}
              disabled={!isConnected || !gameStarted || !hasPendingCommit || breakPending}
            >
              {breakPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Break commitment
            </Button>
            <Button variant="ghost" onClick={handleForfeit} disabled={!isConnected || !canForfeit || forfeitPending}>
              Forfeit
            </Button>
          </div>

          <Separator />
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Boot player index:</span>
            <Input
              className="w-24"
              value={bootTarget}
              onChange={(e) => setBootTarget(e.target.value)}
              placeholder="idx"
            />
            <Button variant="outline" size="sm" onClick={handleBoot} disabled={!isConnected || !gameStarted || bootPending}>
              {bootPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Boot out
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
