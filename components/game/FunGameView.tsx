"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CopyToClipboard } from "@/components/ui/copy-to-clipboard"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { WhotCard } from "@/components/whot-card"
import { CardFan, HandFan, HandGrid, HandViewToggle, MarketDeckFan, type HandViewMode } from "@/components/game/fans"
import { CARD_SHAPES, describeCard, marketSize, type OwnedCard } from "@/lib/cards"
import type { GameData, PlayerRow } from "@/components/game/types"

type FunGameViewProps = {
  loadingGame: boolean
  gameData: GameData | null
  isSpectator: boolean
  gameStarted: boolean
  isMyTurn: boolean
  loadingPlayers: boolean
  funPlayers: PlayerRow[]
  me?: PlayerRow
  address?: string
  callCardDisplay: number
  callCardHint: string
  canDraw: boolean
  mustResolvePending: boolean
  pendingPickCount: number
  canResolvePending: boolean
  handleResolvePending: () => void
  handleDrawFromMarket: () => void
  handleRevealHand: () => void
  canRevealHand: boolean
  isRevealingHand: boolean
  revealBlockReason: string | null
  handStale: boolean
  handUpdatedAt: number | null
  handError: string | null
  handFanOpen: boolean
  myHand: OwnedCard[] | null
  action: number
  setAction: (value: number) => void
  needsCommit: boolean
  canCommitSelected: boolean
  handleCommitCard: (index: number) => void
  pendingCardIndex: number | null
  actionLabel: string
  pendingAction: number | null
  pendingActionLabel: string
  shouldShowWishShape: boolean
  wishShape: string
  setWishShape: (value: string) => void
  selectedCard: OwnedCard | null
  pendingCommitStatus: string
  hasPendingCommit: boolean
  isDecrypting: boolean
  canExecutePending: boolean
  executePending: boolean
  breakPending: boolean
  handleExecute: (actionOverride?: number) => void
  handleBreakCommitment: () => void
  joinHandler: () => void
  startHandler: () => void
  joinDisabled: boolean
  joinBusy: boolean
  startDisabled: boolean
  startBusy: boolean
  relayerEnabled: boolean
  setRelayerEnabled: (value: boolean) => void
  relayerAddress: string
  bootTarget: string
  setBootTarget: (value: string) => void
  handleBoot: () => void
  bootPending: boolean
  isConnected: boolean
  canForfeit: boolean
  forfeitPending: boolean
  handleForfeit: () => void
  setViewMode: (mode: "tech" | "fun") => void
  fheStatus: string
  formatAddr: (addr: string) => string
  zeroAddress: string
}

export function FunGameView({
  loadingGame,
  gameData,
  isSpectator,
  gameStarted,
  isMyTurn,
  loadingPlayers,
  funPlayers,
  me,
  address,
  callCardDisplay,
  callCardHint,
  canDraw,
  mustResolvePending,
  pendingPickCount,
  canResolvePending,
  handleResolvePending,
  handleDrawFromMarket,
  handleRevealHand,
  canRevealHand,
  isRevealingHand,
  revealBlockReason,
  handStale,
  handUpdatedAt,
  handError,
  handFanOpen,
  myHand,
  action,
  setAction,
  needsCommit,
  canCommitSelected,
  handleCommitCard,
  pendingCardIndex,
  actionLabel,
  pendingAction,
  pendingActionLabel,
  shouldShowWishShape,
  wishShape,
  setWishShape,
  selectedCard,
  pendingCommitStatus,
  hasPendingCommit,
  isDecrypting,
  canExecutePending,
  executePending,
  breakPending,
  handleExecute,
  handleBreakCommitment,
  joinHandler,
  startHandler,
  joinDisabled,
  joinBusy,
  startDisabled,
  startBusy,
  relayerEnabled,
  setRelayerEnabled,
  relayerAddress,
  bootTarget,
  setBootTarget,
  handleBoot,
  bootPending,
  isConnected,
  canForfeit,
  forfeitPending,
  handleForfeit,
  setViewMode,
  fheStatus,
  formatAddr,
  zeroAddress,
}: FunGameViewProps) {
  const [handViewMode, setHandViewMode] = useState<HandViewMode>("fan")
  const marketCount = gameData ? marketSize(gameData.marketDeckMap) : 0
  const drawHandler = mustResolvePending ? handleResolvePending : handleDrawFromMarket
  const canDrawNow = mustResolvePending ? canResolvePending : canDraw
  const drawHint = mustResolvePending
    ? `Resolve pending draw (${pendingPickCount})`
    : canDraw
      ? "Click to draw"
      : "Draw on your turn"

  return (
    <div className="flex flex-1 min-h-0 flex-col rounded-2xl border border-border bg-card p-3 shadow-sm sm:rounded-3xl sm:p-4">
      {loadingGame ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading game data...
        </div>
      ) : !gameData ? (
        <div className="mt-6 rounded-xl border border-dashed bg-white p-4 text-sm text-muted-foreground">
          No game data found.
        </div>
      ) : isSpectator ? (
        <div className="grid min-h-0 flex-1 gap-3 sm:gap-4 lg:grid-cols-3">
          <div className="flex min-h-0 flex-col gap-3 sm:gap-4 lg:col-span-2">
            <div className="rounded-2xl border bg-white p-3 shadow-sm sm:rounded-3xl sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-medium text-muted-foreground">Status</div>
                  <div className="text-lg font-semibold">
                    {["Open", "Started", "Ended"][gameData.status] ?? "Unknown"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground">Turn</div>
                  <div className="text-lg font-semibold">Player #{gameData.playerTurnIdx}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground">Seats</div>
                  <div className="text-lg font-semibold">
                    {gameData.playersJoined}/{gameData.maxPlayers}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Call card</div>
                  <div className="flex items-center gap-3">
                    <div className="h-20 w-14 shadow-sm transition-transform hover:scale-105 sm:h-24 sm:w-16">
                      {callCardDisplay ? (
                        <WhotCard
                          variant="face"
                          shape={describeCard(callCardDisplay)}
                          number={callCardDisplay & 0x1f}
                        />
                      ) : (
                        <WhotCard variant="back" faded />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <div className="font-semibold text-foreground">
                        {callCardDisplay ? describeCard(callCardDisplay) : "Face down"}
                      </div>
                      <div>{callCardHint}</div>
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Market deck</div>
                  <div className="flex items-center gap-3 pt-1">
                    <MarketDeckFan count={marketCount} canDraw={canDrawNow} onDraw={drawHandler} />
                    <div className="text-xs text-muted-foreground">
                      <div className="font-semibold text-foreground">{marketCount} cards</div>
                      <div>{drawHint}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-3 shadow-sm sm:rounded-3xl sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-muted-foreground">Your hand</div>
                  <div className="text-sm font-semibold">
                    {gameStarted
                      ? isMyTurn
                        ? "It's your move"
                        : "Waiting for your turn"
                      : "Game not started"}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={handleRevealHand} disabled={!canRevealHand || isRevealingHand}>
                    {isRevealingHand ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {myHand?.length ? "Refresh hand" : "Reveal hand"}
                  </Button>
                  {!canRevealHand && revealBlockReason ? (
                    <span className="text-xs text-muted-foreground">{revealBlockReason}</span>
                  ) : null}
                  {handStale ? (
                    <span className="text-xs text-muted-foreground">Hand changed. Reveal again.</span>
                  ) : null}
                  {handUpdatedAt ? (
                    <span className="text-xs text-muted-foreground">
                      Updated {new Date(handUpdatedAt).toLocaleTimeString()}
                    </span>
                  ) : null}
                </div>
              </div>

              {mustResolvePending ? (
                <div className="mt-3 rounded-2xl border border-border bg-secondary/40 p-3 text-xs">
                  <div className="font-semibold text-foreground">Pending pick {pendingPickCount}</div>
                  <div className="text-muted-foreground">
                    Resolve your pending draw before playing another card.
                  </div>
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

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Action</span>
                <Button
                  size="sm"
                  variant={action === 0 ? "secondary" : "outline"}
                  onClick={() => setAction(0)}
                  disabled={!gameStarted || mustResolvePending}
                >
                  Play
                </Button>
                <Button
                  size="sm"
                  variant={action === 1 ? "secondary" : "outline"}
                  onClick={() => setAction(1)}
                  disabled={!gameStarted || mustResolvePending}
                >
                  Defend
                </Button>
                <span className="text-xs text-muted-foreground">
                  {mustResolvePending
                    ? "Resolve pending draw first"
                    : needsCommit
                      ? "Click a card to commit"
                      : "Select Play or Defend to commit"}
                </span>
              </div>

              {shouldShowWishShape ? (
                <div className="mt-3 rounded-2xl border border-border bg-secondary/40 p-3">
                  <div className="text-xs font-medium text-muted-foreground">Whot wish</div>
                  <div className="text-xs text-muted-foreground">
                    Choose a shape for {selectedCard?.label ?? "Whot-20"}.
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {CARD_SHAPES.map((shape, idx) => (
                      <Button
                        key={shape}
                        size="sm"
                        variant={wishShape === idx.toString() ? "secondary" : "outline"}
                        onClick={() => setWishShape(idx.toString())}
                      >
                        {shape}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}

              {handError ? <p className="mt-2 text-xs text-destructive">{handError}</p> : null}
              {fheStatus !== "ready" && gameStarted ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  FHE relayer is {fheStatus}. Connect a wallet to decrypt.
                </p>
              ) : null}

              <div className="mt-4">
                {!gameStarted ? (
                  <p className="text-xs text-muted-foreground">Start the game to receive cards.</p>
                ) : !me ? (
                  <p className="text-xs text-muted-foreground">Join the game to see your hand.</p>
                ) : myHand?.length ? (
                  <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {myHand.map((card) => (
                      <button
                        key={card.index}
                        type="button"
                        onClick={() => handleCommitCard(card.index)}
                        disabled={!canCommitSelected}
                        title={`Commit ${actionLabel} with idx ${card.index}`}
                        className={`group relative rounded-xl p-1 transition ${
                          pendingCardIndex === card.index
                            ? "ring-2 ring-primary"
                            : "ring-1 ring-slate-200"
                        } ${canCommitSelected ? "cursor-pointer hover:-translate-y-1" : "cursor-not-allowed opacity-60"}`}
                      >
                        <WhotCard variant="face" shape={card.shape} number={card.number} />
                        <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                          #{card.index}
                        </span>
                        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
                          {actionLabel}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <CardFan count={me?.cards.length ?? 0} faded={false} />
                    <p className="text-xs text-muted-foreground">Reveal your hand to view card faces.</p>
                  </div>
                )}
              </div>

              {hasPendingCommit || isDecrypting ? (
                <div className="mt-4 rounded-2xl border border-border bg-secondary/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="text-muted-foreground">{pendingCommitStatus}</div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleExecute(pendingAction ?? action)}
                        disabled={!canExecutePending}
                      >
                      {executePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Execute {pendingActionLabel}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleBreakCommitment}
                      disabled={!gameStarted || breakPending || !hasPendingCommit}
                    >
                      {breakPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Break
                    </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">Players</div>
              {loadingPlayers ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading players...
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {funPlayers.map((player) => {
                    const isEmpty = player.addr.toLowerCase() === zeroAddress
                    const isCurrent = gameData.playerTurnIdx === player.index
                    const isMe = me?.index === player.index
                    return (
                      <div
                        key={`fun-player-${player.index}`}
                        className={`relative rounded-2xl border p-3 transition-colors ${
                          isCurrent
                            ? "border-primary/40 bg-white ring-2 ring-primary/20"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold">
                              {isEmpty ? "Open seat" : `Player #${player.index}`}
                            </div>
                            {!isEmpty && (
                              <CopyToClipboard
                                text={player.addr}
                                className="h-5 w-5 text-muted-foreground/50"
                              />
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            {isMe ? <Badge>Me</Badge> : null}
                            {player.forfeited ? <Badge variant="destructive">Forfeited</Badge> : null}
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {isEmpty ? "Waiting for player..." : formatAddr(player.addr)}
                        </div>
                        <div className="mt-2 flex flex-col gap-2 sm:mt-3">
                          <div className="-translate-y-3 flex-shrink-0">
                            <CardFan count={player.cards.length} faded={isEmpty} />
                          </div>
                          <div className="text-xs font-semibold text-foreground absolute bottom-3 right-3">
                            {player.cards.length} cards
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-3">
            <div className="rounded-2xl border bg-white p-3 shadow-sm">
              <div className="text-xs font-medium text-muted-foreground">You</div>
              <div className="mt-1 flex items-center justify-between text-sm font-semibold">
                <span>{address ? formatAddr(address) : "Not connected"}</span>
                {address && <CopyToClipboard text={address} className="h-5 w-5" />}
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <div>{me ? `Seat #${me.index}` : "Not seated yet"}</div>
                <div>{me ? `${me.cards.length} cards in hand` : "Join to receive cards"}</div>
                <div>
                  {isMyTurn ? (
                    <span className="text-primary font-bold">It is your turn!</span>
                  ) : (
                    "Waiting for your turn"
                  )}
                </div>
              </div>
              {gameData?.status === 0 ? (
                <div className="mt-4 space-y-2">
                  <div className="grid gap-2">
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
                  <div className="text-[10px] text-muted-foreground">
                    {relayerEnabled ? `Relayer: ${formatAddr(relayerAddress)}` : "Relayer disabled"}
                  </div>
                </div>
              ) : null}
              {gameStarted ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleForfeit}
                    disabled={!canForfeit || forfeitPending}
                  >
                    {forfeitPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Forfeit
                  </Button>
                </div>
              ) : null}
              <Button className="mt-4 w-full" variant="secondary" onClick={() => setViewMode("tech")}>Go to tech controls</Button>
            </div>

            <div className="rounded-2xl border bg-white p-3 shadow-sm">
              <div className="text-xs font-medium text-muted-foreground">Game Info</div>
              <div className="mt-3 space-y-3">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Ruleset</div>
                  <div className="flex items-center gap-2 text-xs font-medium">
                    {formatAddr(gameData.ruleset)}
                    <CopyToClipboard text={gameData.ruleset} className="h-4 w-4" />
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Creator</div>
                  <div className="flex items-center gap-2 text-xs font-medium">
                    {formatAddr(gameData.gameCreator)}
                    <CopyToClipboard text={gameData.gameCreator} className="h-4 w-4" />
                  </div>
                </div>
                {gameStarted ? (
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Admin</div>
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        className="h-8 w-20 text-xs"
                        value={bootTarget}
                        onChange={(e) => setBootTarget(e.target.value)}
                        placeholder="idx"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleBoot}
                        disabled={!isConnected || bootPending}
                      >
                        {bootPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Boot
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 sm:gap-4">
          <div className="rounded-2xl border bg-white p-3 shadow-sm sm:rounded-3xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-muted-foreground">Other players</div>
                <div className="text-sm font-semibold">
                  {gameData.playersJoined}/{gameData.maxPlayers} seated
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">Seat #{me?.index ?? "-"}</Badge>
                {isMyTurn ? <Badge>My turn</Badge> : <span>Waiting for turn</span>}
                {canForfeit ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleForfeit}
                    disabled={!canForfeit || forfeitPending}
                  >
                    {forfeitPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Forfeit
                  </Button>
                ) : null}
              </div>
            </div>

            {loadingPlayers ? (
              <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading players...
              </div>
            ) : (
              <div className="mt-3 flex overflow-x-auto gap-3 pb-2 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:pb-0 scrollbar-hide snap-x">
                {funPlayers.map((player) => {
                  const isEmpty = player.addr.toLowerCase() === zeroAddress
                  const isCurrent = gameData.playerTurnIdx === player.index
                  const isMe = me?.index === player.index
                  return (
                    <div
                      key={`fun-player-${player.index}`}
                      className={`min-w-[160px] sm:min-w-0 flex-shrink-0 snap-center rounded-2xl border p-3 transition-colors relative ${
                        isCurrent
                          ? "border-primary/40 bg-white ring-2 ring-primary/20"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold">
                            {isEmpty ? "Open" : `Player#${player.index}`}
                          </div>
                          {!isEmpty && (
                            <CopyToClipboard text={player.addr} className="h-5 w-5 text-muted-foreground/50" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          {isMe ? <Badge className="px-1 text-[10px] h-5">Me</Badge> : null}
                          {player.forfeited ? (
                            <Badge variant="destructive" className="px-1 text-[10px] h-5">
                              Left
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground truncate">
                        {isEmpty ? "Waiting..." : formatAddr(player.addr)}
                      </div>
                      <div className="mt-2 flex flex-col gap-2 sm:mt-3">
                        <div className="-translate-y-3 flex-shrink-0">
                          <CardFan count={player.cards.length} faded={isEmpty} />
                        </div>
                        <div className="text-xs font-semibold text-foreground whitespace-nowrap absolute bottom-3 right-3">
                          {player.cards.length} cards
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {gameData.status === 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3">
                <Button size="sm" variant="secondary" onClick={startHandler} disabled={startDisabled}>
                  {startBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Start game
                </Button>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Relayer</span>
                  <Switch checked={relayerEnabled} onCheckedChange={setRelayerEnabled} />
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border bg-white p-3 shadow-sm flex-shrink-0 sm:rounded-3xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-muted-foreground">Table</div>
                <div className="text-sm font-semibold">
                  {["Open", "Started", "Ended"][gameData.status] ?? "Unknown"} | Turn #{gameData.playerTurnIdx}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {gameData.playersJoined}/{gameData.maxPlayers} Seated
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Call card</div>
                <div className="flex items-center gap-3">
                  <div className="h-20 w-14 shadow-sm transition-transform hover:scale-105 sm:h-24 sm:w-16">
                    {callCardDisplay ? (
                      <WhotCard variant="face" shape={describeCard(callCardDisplay)} number={callCardDisplay & 0x1f} />
                    ) : (
                      <WhotCard variant="back" faded />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <div className="font-semibold text-foreground">
                      {callCardDisplay ? describeCard(callCardDisplay) : "Face down"}
                    </div>
                    <div>{callCardHint}</div>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Market deck</div>
                <div className="flex items-center gap-3 pt-1">
                  <MarketDeckFan count={marketCount} canDraw={canDrawNow} onDraw={drawHandler} />
                  <div className="text-xs text-muted-foreground">
                    <div className="font-semibold text-foreground">{marketCount} cards</div>
                    <div>{drawHint}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
              <div className="flex items-center gap-1">
                <span>Ruleset</span>
                <span className="font-medium text-foreground">{formatAddr(gameData.ruleset)}</span>
                <CopyToClipboard text={gameData.ruleset} className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-1">
                <span>Creator</span>
                <span className="font-medium text-foreground">{formatAddr(gameData.gameCreator)}</span>
                <CopyToClipboard text={gameData.gameCreator} className="h-4 w-4" />
              </div>
              {gameStarted ? (
                <div className="flex items-center gap-2">
                  <Input
                    className="h-8 w-20 text-xs"
                    value={bootTarget}
                    onChange={(e) => setBootTarget(e.target.value)}
                    placeholder="idx"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBoot}
                    disabled={!isConnected || bootPending}
                  >
                    {bootPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Boot
                  </Button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col rounded-2xl border bg-white p-3 shadow-sm sm:rounded-3xl sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-muted-foreground">Your hand</div>
                <div className="text-sm font-semibold">
                  {gameStarted ? (isMyTurn ? "It's your move" : "Waiting for your turn") : "Game not started"}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={handleRevealHand} disabled={!canRevealHand || isRevealingHand}>
                  {isRevealingHand ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {myHand?.length ? "Refresh hand" : "Reveal hand"}
                </Button>
                {!canRevealHand && revealBlockReason ? (
                  <span className="text-xs text-muted-foreground">{revealBlockReason}</span>
                ) : null}
                {handStale ? (
                  <span className="text-xs text-muted-foreground">Hand changed. Reveal again.</span>
                ) : null}
                {handUpdatedAt ? (
                  <span className="text-xs text-muted-foreground">
                    Updated {new Date(handUpdatedAt).toLocaleTimeString()}
                  </span>
                ) : null}
              </div>
            </div>

            {mustResolvePending ? (
              <div className="mt-3 rounded-2xl border border-border bg-secondary/40 p-3 text-xs">
                <div className="font-semibold text-foreground">Pending pick {pendingPickCount}</div>
                <div className="text-muted-foreground">Resolve your pending draw before playing another card.</div>
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

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Action</span>
              <Button
                size="sm"
                variant={action === 0 ? "secondary" : "outline"}
                onClick={() => setAction(0)}
                disabled={!gameStarted || mustResolvePending}
              >
                Play
              </Button>
              <Button
                size="sm"
                variant={action === 1 ? "secondary" : "outline"}
                onClick={() => setAction(1)}
                disabled={!gameStarted || mustResolvePending}
              >
                Defend
              </Button>
              <span className="text-xs text-muted-foreground">
                {mustResolvePending
                  ? "Resolve pending draw first"
                  : needsCommit
                    ? "Click a card to commit"
                    : "Select Play or Defend to commit"}
              </span>
            </div>

            {shouldShowWishShape ? (
              <div className="relative z-30 mt-3 rounded-2xl border border-border bg-secondary/95 p-4 shadow-2xl backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2">
                <div className="text-xs font-medium text-muted-foreground">Whot wish</div>
                <div className="text-xs text-muted-foreground">
                  Choose a shape for {selectedCard?.label ?? "Whot-20"}.
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CARD_SHAPES.map((shape, idx) => (
                    <Button
                      key={shape}
                      size="sm"
                      variant={wishShape === idx.toString() ? "secondary" : "outline"}
                      onClick={() => setWishShape(idx.toString())}
                    >
                      {shape}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {handError ? <p className="mt-2 text-xs text-destructive">{handError}</p> : null}
            {fheStatus !== "ready" && gameStarted ? (
              <p className="mt-2 text-xs text-muted-foreground">
                FHE relayer is {fheStatus}. Connect a wallet to decrypt.
              </p>
            ) : null}

            <div className={`relative mt-3 ${myHand?.length ? 'min-h-[200px]' : ''}`}>
              {!gameStarted ? (
                <p className="text-xs text-muted-foreground">Start the game to receive cards.</p>
              ) : !me ? (
                <p className="text-xs text-muted-foreground">Join the game to see your hand.</p>
              ) : myHand?.length ? (
                handViewMode === "grid" ? (
                  <HandGrid
                    cards={myHand}
                    canSelect={canCommitSelected}
                    pendingIndex={pendingCardIndex}
                    actionLabel={actionLabel}
                    onSelect={handleCommitCard}
                  />
                ) : (
                  <HandFan
                    cards={myHand}
                    canSelect={canCommitSelected}
                    pendingIndex={pendingCardIndex}
                    actionLabel={actionLabel}
                    open={handFanOpen}
                    onSelect={handleCommitCard}
                  />
                )
              ) : (
                <div className="flex items-center gap-4 py-2">
                  <CardFan count={me?.cards.length ?? 0} faded={false} />
                  <p className="text-xs text-muted-foreground">Reveal your hand to view card faces.</p>
                </div>
              )}
              {myHand?.length ? (
                <div className="absolute bottom-2 right-2">
                  <HandViewToggle mode={handViewMode} onChange={setHandViewMode} />
                </div>
              ) : null}
            </div>

            {hasPendingCommit || isDecrypting ? (
              <div className="mt-3 rounded-2xl border border-border bg-secondary/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="text-muted-foreground">{pendingCommitStatus}</div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleExecute(pendingAction ?? action)}
                      disabled={!canExecutePending}
                    >
                      {executePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Execute {pendingActionLabel}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleBreakCommitment}
                      disabled={!gameStarted || breakPending || !hasPendingCommit}
                    >
                      {breakPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Break
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
