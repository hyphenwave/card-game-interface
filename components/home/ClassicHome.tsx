"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, ArrowRight, Loader2, Plus, Settings, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { useAccount, useConnect, usePublicClient } from "wagmi"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { describeCard } from "@/lib/cards"
import { useCardGameActions } from "@/hooks/useCardGameActions"
import { exportBurner, importBurnerPrivateKey, regenerateBurnerAccount } from "@/lib/burner"
import { CustomConnectButton } from "@/components/custom-connect-button"
import { CopyToClipboard } from "@/components/ui/copy-to-clipboard"
import { activeChain } from "@/config/web3Shared"
import { useGameFeed } from "@/hooks/useGameFeed"

const statusLabel: Record<number, string> = {
  0: "Open",
  1: "Started",
  2: "Ended",
}

const parseGameId = (value: string): bigint | null => {
  try {
    return BigInt(value.trim())
  } catch {
    return null
  }
}

export function ClassicHome() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { connectAsync, connectors } = useConnect()
  const { createGame, joinGame, isConnected: canTransact } = useCardGameActions()
  const chainId = publicClient?.chain?.id ?? activeChain.id
  const queryClient = useQueryClient()

  const { data: indexedGames = [], isFetching, isError, error } = useGameFeed(publicClient)

  const games = useMemo(() => indexedGames, [indexedGames])

  const [proposedPlayers, setProposedPlayers] = useState<string[]>([""])
  const [maxPlayers, setMaxPlayers] = useState(2)
  const [initialHandSize, setInitialHandSize] = useState(5)
  const [joinId, setJoinId] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [showFeed, setShowFeed] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [burnerPk, setBurnerPk] = useState("")
  const [rouletteMode, setRouletteMode] = useState(false)
  const burnerInfo = exportBurner()
  const burnerAddress = burnerInfo?.address ?? ""
  const isBurnerConnected = Boolean(
    address && burnerAddress && address.toLowerCase() === burnerAddress.toLowerCase(),
  )

  useEffect(() => setIsMounted(true), [])

  const handleBurnerConnect = async () => {
    const burner = connectors.find((c) => c.id === "burner")
    if (!burner) {
      toast.error("Burner connector unavailable")
      return
    }
    await connectAsync({ connector: burner, chainId })
  }

  const addPlayerField = () => setProposedPlayers((prev) => [...prev, ""])
  const updatePlayer = (idx: number, value: string) =>
    setProposedPlayers((prev) => prev.map((p, i) => (i === idx ? value : p)))
  const removePlayer = (idx: number) =>
    setProposedPlayers((prev) => prev.filter((_, i) => i !== idx))

  const handleCopyBurner = async () => {
    const data = exportBurner()
    if (!data) {
      toast.error("No burner found")
      return
    }
    await navigator.clipboard.writeText(data.privateKey)
    toast.success("Burner key copied")
  }

  const handleImportBurner = () => {
    try {
      const account = importBurnerPrivateKey(burnerPk)
      setBurnerPk("")
      toast.success("Burner imported", { description: account.address })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed"
      toast.error(message)
    }
  }

  const handleResetBurner = () => {
    const account = regenerateBurnerAccount()
    toast.success("Burner reset", { description: account.address })
  }

  const handleCreateGame = async () => {
    try {
      const tx = await createGame.mutateAsync({
        proposedPlayers: proposedPlayers.filter(Boolean) as `0x${string}`[],
        maxPlayers,
        initialHandSize,
        roulette: rouletteMode,
      })
      toast.success("Game created", {
        description: `Game id ${tx.gameId ?? "unknown"}`,
      })
      queryClient.invalidateQueries({ queryKey: ["game-index", chainId] })
      setProposedPlayers([""])
      setRouletteMode(false)
      setShowCreate(false)
    } catch (err) {
      toast.error("Create game failed", { description: err instanceof Error ? err.message : "Unknown error" })
      console.error(err)
    }
  }

  const handleJoin = async () => {
    const id = parseGameId(joinId)
    if (!id) {
      toast.error("Enter a valid game id (number or hex)")
      return
    }
    try {
      await joinGame.mutateAsync({ gameId: id })
      toast.success(`Joined game ${joinId}`)
      queryClient.invalidateQueries({ queryKey: ["game-index", chainId] })
      setJoinId("")
    } catch (err) {
      toast.error("Join failed", { description: err instanceof Error ? err.message : "Unknown error" })
    }
  }

  const formatAddr = (addr: string) => {
    if (!addr) return "—"
    return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <main className="mx-auto flex w-full max-w-[67.5vw] flex-1 flex-col items-center gap-6 px-4 py-14 md:max-w-[56.25vw] lg:max-w-[45vw] xl:max-w-[37.5vw]">
        <header className="flex w-full flex-col gap-3">
          <div className="flex items-center justify-end">
            <div className="flex items-center gap-2">
              {isMounted ? <CustomConnectButton /> : null}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Settings className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 space-y-2">
                  <div className="text-sm font-medium">Burner wallet</div>
                  <p className="text-xs text-muted-foreground">Stored locally for quick joins.</p>
                  <div className="space-y-1 rounded-md border bg-secondary/40 p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span>Burner: {formatAddr(burnerAddress)}</span>
                      {burnerAddress ? <CopyToClipboard text={burnerAddress} /> : null}
                    </div>
                    <div className="text-muted-foreground">
                      Active: {formatAddr(address ?? "") || "—"}
                      {isBurnerConnected ? " (burner)" : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" className="flex-1" onClick={handleBurnerConnect}>
                      Use burner
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleResetBurner}
                      title="Reset burner wallet"
                    >
                      <RotateCcw className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleCopyBurner}>
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
                      <Button size="sm" variant="outline" onClick={handleImportBurner}>
                        Save
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-3xl font-semibold text-primary">Whot On-Chain</h1>
            <p className="text-muted-foreground text-sm">Encrypted • Fair • On-Chain</p>
          </div>
        </header>

        <section className="w-full space-y-4">
          {!showCreate ? (
            <>
              <Card className="shadow-sm">
                <CardHeader className="space-y-1">
                  <CardTitle className="text-lg">Join a Game</CardTitle>
                  <CardDescription>Pick an active lobby or enter an ID.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    {games.length ? (
                      games.slice(0, 2).map((game) => (
                        <Link
                          key={game.gameId.toString()}
                          href={`/games/${game.gameId.toString()}`}
                          className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2"
                        >
                          <div>
                            <p className="font-medium">Game #{game.gameId.toString()}</p>
                            <p className="text-muted-foreground text-xs">
                              {statusLabel[game.status] ?? "Unknown"} • {game.playersJoined}/{game.maxPlayers} players
                            </p>
                          </div>
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      ))
                    ) : isFetching ? (
                      <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Loading games...
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                        No games yet. Create a lobby to get started.
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input value={joinId} onChange={(e) => setJoinId(e.target.value)} placeholder="Game ID" />
                    <Button onClick={handleJoin} disabled={!canTransact || joinGame.isPending}>
                      {joinGame.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  className="w-full border-dashed border-primary text-primary"
                  onClick={() => setShowCreate(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create New Game
                </Button>
              </div>
            </>
          ) : (
            <Card className="w-full shadow-sm">
              <CardHeader className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Button
                    variant="link"
                    size="sm"
                    className="px-0 text-primary"
                    onClick={() => setShowCreate(false)}
                  >
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Back to Games
                  </Button>
                </div>
                <CardTitle className="text-lg">Create Game</CardTitle>
                <CardDescription>WhotManager pulls encrypted decks from the trusted shuffle service.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Max players</label>
                    <Input
                      type="number"
                      min={2}
                      max={8}
                      value={maxPlayers}
                      onChange={(e) => setMaxPlayers(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Initial hand</label>
                    <Input
                      type="number"
                      min={1}
                      max={7}
                      value={initialHandSize}
                      onChange={(e) => setInitialHandSize(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="rounded-lg border bg-secondary/50 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">Roulette mode</p>
                      <p className="text-muted-foreground text-xs">
                        Ends the game immediately on start (manager hook).
                      </p>
                    </div>
                    <Switch checked={rouletteMode} onCheckedChange={setRouletteMode} />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Add players</span>
                    <Button variant="ghost" size="sm" onClick={addPlayerField} className="h-7 px-2 text-xs">
                      <Plus className="mr-1 h-3 w-3" /> Add
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-24 overflow-y-auto">
                    {proposedPlayers.map((player, idx) => (
                      <div key={idx} className="flex gap-2">
                        <Input
                          value={player}
                          onChange={(e) => updatePlayer(idx, e.target.value)}
                          placeholder="0x..."
                        />
                        {proposedPlayers.length > 1 ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => removePlayer(idx)}
                          >
                            ×
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border bg-secondary/50 p-3 text-sm">
                  <p className="font-medium">Encrypted deck source</p>
                  <p className="text-muted-foreground text-xs">
                    Handles are fetched on-chain from TrustedShuffleServiceV0 by WhotManager.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button className="flex-1" variant="outline" onClick={() => setShowCreate(false)}>
                    Cancel
                  </Button>
                  <Button className="flex-1" onClick={handleCreateGame} disabled={!canTransact || createGame.isPending}>
                    {createGame.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Create
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        <section className="w-full space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Game feed</h2>
              <p className="text-muted-foreground text-sm">Pulled from on-chain storage.</p>
            </div>
            <div className="flex items-center gap-2">
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
              <Badge variant="outline">{games.length} games</Badge>
              <Button variant="ghost" size="sm" onClick={() => setShowFeed((v) => !v)}>
                {showFeed ? "Hide" : "Show"}
              </Button>
            </div>
          </div>
          {isError ? (
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              Feed error: {error instanceof Error ? error.message : "Unable to load games"}
            </div>
          ) : null}
          {showFeed ? (
            <div className="grid grid-cols-1 gap-3">
              {games.map((game) => (
                <Card key={game.gameId.toString()} className="gap-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">Game #{game.gameId.toString()}</CardTitle>
                      <Badge variant={game.status === 1 ? "default" : "secondary"}>
                        {statusLabel[game.status] ?? "Unknown"}
                      </Badge>
                    </div>
                    <CardDescription className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant="outline" className="max-w-full truncate">
                        Creator: {formatAddr(game.creator)}
                      </Badge>
                      <Badge variant="outline" className="max-w-full truncate">
                        Ruleset: {formatAddr(game.ruleset)}
                      </Badge>
                      <Badge variant="outline">Turn: {game.playerTurnIdx}</Badge>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <div className="rounded-lg bg-secondary px-3 py-2 font-medium">
                        Call: {game.callCard === 0 ? "No call card yet" : describeCard(game.callCard)}
                      </div>
                      <div className="text-muted-foreground text-xs flex flex-wrap items-center gap-2">
                        <span>Market: {game.marketCount}</span>
                        <span>
                          Seats: {game.playersJoined}/{game.maxPlayers}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="text-muted-foreground">
                        {isMounted && game.lastMove ? `Last activity few moments ago` : "Activity pending"}
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/games/${game.gameId.toString()}`}>
                          <Button variant="outline" size="sm">
                            View
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}
        </section>
      </main>
      <footer className="border-t border-border bg-secondary px-4 py-6 text-center text-xs text-foreground">
        <div className="space-y-1">
          <p>© 2025 Whot On-Chain</p>
          <p className="text-muted-foreground">Built with Zama FHE • Ethereum </p>
        </div>
      </footer>
    </div>
  )
}
