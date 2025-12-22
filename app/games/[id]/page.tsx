"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  encodeAbiParameters,
  parseEventLogs,
  toHex,
  type Address,
  type Hex,
} from "viem"
import { useAccount, usePublicClient, useSignTypedData } from "wagmi"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useFhevm } from "@/hooks/useFhevm"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CopyToClipboard } from "@/components/ui/copy-to-clipboard"
import { CustomConnectButton } from "@/components/custom-connect-button"
import { WhotCard } from "@/components/whot-card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { cardEngineAbi } from "@/lib/abi/cardEngine"
import { CARD_SHAPES, decodeHandCards, deckMapToIndexes, describeCard, marketSize, type OwnedCard } from "@/lib/cards"
import { useCardGameActions } from "@/hooks/useCardGameActions"
import { readGameData, readPlayerData } from "@/lib/cardEngineView"
import { getContracts } from "@/config/contracts"
import { activeChain } from "@/config/web3Shared"
import { RELAYER_ADDRESS } from "@/config/relayer"
import { relayGameAction } from "@/lib/relay"
import { getFheKeypair, saveFheKeypair } from "@/lib/fheKeys"
import { exportBurner, onBurnerUpdated } from "@/lib/burner"

type GameData = {
  gameCreator: string
  callCard: number
  playerTurnIdx: number
  status: number
  playersLeftToJoin: number
  playersJoined: number
  maxPlayers: number
  marketDeckMap: bigint
  ruleset: string
}

type PlayerRow = {
  index: number
  addr: string
  score: number
  deckMap: bigint
  pendingAction: number
  forfeited: boolean
  cards: number[]
  hand0: bigint
  hand1: bigint
}

const ACTIONS = [
  { value: 0, label: "Play" },
  { value: 1, label: "Defend" },
  { value: 2, label: "Draw" },
] as const

const GAME_ERROR_ABI = [
  { type: "error", name: "PlayerAlreadyInGame", inputs: [] },
  { type: "error", name: "PlayerNotInGame", inputs: [] },
  { type: "error", name: "GameAlreadyStarted", inputs: [] },
  { type: "error", name: "GameNotStarted", inputs: [] },
  { type: "error", name: "InvalidPlayerAddress", inputs: [{ name: "addr", type: "address" }] },
  { type: "error", name: "ResolvePendingAction", inputs: [] },
  { type: "error", name: "NotProposedPlayer", inputs: [{ name: "player", type: "address" }] },
  { type: "error", name: "CannotStartGame", inputs: [] },
  { type: "error", name: "PlayersLimitExceeded", inputs: [] },
  { type: "error", name: "PlayersLimitNotMet", inputs: [] },
  { type: "error", name: "CannotBootOutPlayer", inputs: [{ name: "player", type: "address" }] },
  { type: "error", name: "InvalidGameAction", inputs: [{ name: "action", type: "uint8" }] },
  { type: "error", name: "PlayerAlreadyCommittedAction", inputs: [] },
  { type: "error", name: "NoCommittedAction", inputs: [] },
  { type: "error", name: "InvalidPlayerIndex", inputs: [] },
  { type: "error", name: "CardSizeNotSupported", inputs: [] },
  { type: "error", name: "CardDeckSizeTooSmall", inputs: [] },
  { type: "error", name: "CardIndexOutOfBounds", inputs: [{ name: "cardIndex", type: "uint256" }] },
  { type: "error", name: "CardIndexIsEmpty", inputs: [{ name: "cardIndex", type: "uint256" }] },
  { type: "error", name: "AsyncHandler_InvalidCommitmentHash", inputs: [] },
  { type: "error", name: "PlayerCardDoesNotMatchCallCard", inputs: [] },
  { type: "error", name: "DefenseNotEnabled", inputs: [] },
  { type: "error", name: "InvalidAction", inputs: [] },
] as const

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
const RELAYER_TOGGLE_KEY = "whot-relayer-enabled"
const VIEW_MODE_KEY = "whot-view-mode"

type ViewMode = "tech" | "fun"

const parseGameId = (raw: string): bigint | null => {
  try {
    return BigInt(raw)
  } catch {
    return null
  }
}

const parseCardIndex = (raw: string): bigint | null => {
  try {
    const trimmed = raw.trim()
    if (!trimmed) return null
    return BigInt(trimmed)
  } catch {
    return null
  }
}

const formatAddr = (addr: string) => {
  if (!addr) return "—"
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

const formatGameError = (name: string, args?: readonly unknown[]) => {
  switch (name) {
    case "PlayerAlreadyCommittedAction":
      return "You already committed a move. Execute or break it."
    case "NoCommittedAction":
      return "No committed move found."
    case "GameNotStarted":
      return "Game not started yet."
    case "InvalidPlayerAddress":
      return "You are not the current player for this turn."
    case "PlayerNotInGame":
      return "Your address is not in this game."
    case "CardIndexIsEmpty":
      return "That card slot is empty."
    case "CardIndexOutOfBounds":
      return "Card index is out of range."
    case "PlayerCardDoesNotMatchCallCard":
      return "Card does not match the call card."
    case "DefenseNotEnabled":
      return "Defend is not enabled for this move."
    case "AsyncHandler_InvalidCommitmentHash":
      return "Commitment proof mismatch. Break and re-commit."
    case "InvalidAction":
    case "InvalidGameAction":
      return "Invalid action for this turn."
    default:
      if (args?.length) return `${name}(${args.join(", ")})`
      return name
  }
}

const describeViemError = (err: unknown) => {
  if (err instanceof BaseError) {
    const revertError = err.walk(
      (inner) => inner instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError | null
    if (revertError?.data?.errorName) {
      return formatGameError(revertError.data.errorName, revertError.data.args)
    }
    const raw = revertError?.raw
    if (raw) {
      try {
        const decoded = decodeErrorResult({ abi: GAME_ERROR_ABI, data: raw as Hex })
        return formatGameError(decoded.errorName, decoded.args)
      } catch {
        // ignore decode failures
      }
    }
    return err.shortMessage || err.message
  }
  if (err instanceof Error) return err.message
  return String(err)
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const buildFanAngles = (count: number) => {
  if (count <= 1) return [0]
  const spread = Math.min(40, count * 8)
  const step = spread / (count - 1)
  const start = -spread / 2
  return Array.from({ length: count }, (_, idx) => start + step * idx)
}

const compactCardLabel = (card: number) => {
  if (!card) return "?"
  const label = describeCard(card)
  return label
    .replace("Triangle", "Tri")
    .replace("Circle", "Cir")
    .replace("Square", "Sqr")
    .replace("Cross", "X")
    .replace("Star", "Star")
    .replace("Whot", "Whot")
}

const CardFan = ({ count, faded = false }: { count: number; faded?: boolean }) => {
  const displayCount = clamp(count || 1, 1, 7)
  const angles = buildFanAngles(displayCount)
  return (
    <div className="relative h-24 w-40">
      {angles.map((angle, idx) => (
        <div
          key={`fan-${idx}`}
          className="absolute left-[42%] bottom-0 h-20 w-14 origin-bottom shadow-sm transition-all duration-300 hover:-translate-y-2"
          style={{ 
            transform: `translateX(-50%) rotate(${angle}deg) translateY(${Math.abs(angle) / 4}px)`,
            zIndex: idx 
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

const HandFan = ({
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
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const isOpen = open || isHovered
  const angles = buildFanAngles(cards.length).map((angle) => angle * (isOpen ? 1.7 : 0.6))
  const mid = (cards.length - 1) / 2
  const spreadClosed = clamp(160 / Math.max(cards.length - 1, 1), 8, 16)
  const spreadOpen = clamp(280 / Math.max(cards.length - 1, 1), 12, 24)
  const spread = isOpen ? spreadOpen : spreadClosed
  return (
    <div className="flex h-full items-end justify-center">
      <div
        className="relative h-40 w-full max-w-3xl"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false)
          setHoveredIndex(null)
        }}
        onFocusCapture={() => setIsHovered(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setIsHovered(false)
            setHoveredIndex(null)
          }
        }}
      >
        {cards.map((card, idx) => {
          const angle = angles[idx] ?? 0
          const offset = (idx - mid) * spread
          const isCardHovered = hoveredIndex === card.index
          const lift = isOpen ? -Math.abs(angle) * 0.8 - 6 : 16
          const hoverLift = isCardHovered ? -18 : 0
          const hoverScale = isCardHovered ? 1.06 : 1
          const rotate = isOpen ? angle : angle * 0.2
          const translateX = isOpen ? offset : offset * 0.35
          return (
            <button
              key={`hand-${card.index}`}
              type="button"
              onClick={() => onSelect(card.index)}
              disabled={!canSelect}
              onMouseEnter={() => setHoveredIndex(card.index)}
              onMouseLeave={() => setHoveredIndex(null)}
              onFocus={() => setHoveredIndex(card.index)}
              onBlur={() => setHoveredIndex(null)}
              title={`Commit ${actionLabel} with idx ${card.index}`}
              className={`group absolute left-1/2 bottom-0 h-28 w-20 origin-bottom rounded-xl p-1 transition-[transform,opacity] duration-500 ease-out will-change-transform ${
                pendingIndex === card.index ? "ring-2 ring-primary" : "ring-1 ring-border"
              } ${canSelect ? "cursor-pointer" : "cursor-not-allowed"}`}
              style={{
                transform: `translateX(calc(-50% + ${translateX}px)) rotate(${rotate}deg) translateY(${lift + hoverLift}px) scale(${(isOpen ? 1 : 0.96) * hoverScale})`,
                zIndex: isCardHovered ? cards.length + 2 : idx + 1,
                transitionDelay: `${isOpen ? idx * 40 : 0}ms`,
              }}
            >
              <WhotCard variant="face" shape={card.shape} number={card.number} />
              <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                #{card.index}
              </span>
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
                {actionLabel}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const MarketDeckFan = ({
  count,
  canDraw,
  onDraw,
}: {
  count: number
  canDraw: boolean
  onDraw: () => void
}) => {
  const displayCount = clamp(count || 1, 1, 5)
  const angles = buildFanAngles(displayCount).map((angle) => angle * 0.7)
  return (
    <button
      type="button"
      onClick={onDraw}
      disabled={!canDraw}
      title={canDraw ? "Draw from market" : "Draw on your turn"}
      className={`group relative h-24 w-28 transition ${
        canDraw ? "cursor-pointer" : "cursor-not-allowed opacity-60"
      }`}
    >
      {angles.map((angle, idx) => (
        <div
          key={`market-${idx}`}
          className="absolute left-1/2 bottom-0 h-20 w-14 origin-bottom shadow-sm transition-all duration-300 group-hover:-translate-y-1"
          style={{
            transform: `translateX(-50%) rotate(${angle}deg) translateY(${Math.abs(angle) / 5}px)`,
            zIndex: idx,
          }}
        >
          <WhotCard variant="back" faded={!canDraw} />
        </div>
      ))}
      {canDraw ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/35 text-[10px] font-semibold uppercase tracking-wider text-white opacity-0 transition group-hover:opacity-100">
          Draw
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

export default function GamePage() {
  const params = useParams<{ id: string }>()
  const gameId = useMemo(() => parseGameId(params?.id ?? ""), [params])
  const gameKey = gameId ? gameId.toString() : "unknown"
  const publicClient = usePublicClient()
  const { address } = useAccount()
  const { signTypedDataAsync } = useSignTypedData()
  const {
    commitMove,
    breakCommitment,
    executeMove,
    forfeit,
    bootOut,
    joinGame,
    startGame,
    isConnected,
  } = useCardGameActions()
  const {
    publicDecrypt,
    userDecrypt,
    createEip712,
    generateKeypair,
    status: fheStatus,
  } = useFhevm()
  const chainId = publicClient?.chain?.id ?? activeChain.id
  const contracts = useMemo(() => getContracts(chainId), [chainId])

  const [action, setAction] = useState<number>(0)
  const [cardIndex, setCardIndex] = useState("")
  const [wishShape, setWishShape] = useState("0")
  const [bootTarget, setBootTarget] = useState("")
  const [pendingProofData, setPendingProofData] = useState<`0x${string}` | null>(null)
  const [pendingCardIndex, setPendingCardIndex] = useState<number | null>(null)
  const [pendingAction, setPendingAction] = useState<number | null>(null)
  const [isDecrypting, setIsDecrypting] = useState(false)
  const [isRelayingStart, setIsRelayingStart] = useState(false)
  const [relayerEnabled, setRelayerEnabled] = useState(true)
  const [myHand, setMyHand] = useState<OwnedCard[] | null>(null)
  const [isRevealingHand, setIsRevealingHand] = useState(false)
  const [handError, setHandError] = useState<string | null>(null)
  const [handUpdatedAt, setHandUpdatedAt] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("fun")
  const [isMounted, setIsMounted] = useState(false)
  const [handFanOpen, setHandFanOpen] = useState(false)
  const [handStale, setHandStale] = useState(false)
  const [cachedCallCard, setCachedCallCard] = useState(0)
  const [burnerAddress, setBurnerAddress] = useState<string | null>(null)
  const [lastHandSignature, setLastHandSignature] = useState<string | null>(null)
  const autoRevealRef = useRef(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem(RELAYER_TOGGLE_KEY)
    if (stored !== null) {
      setRelayerEnabled(stored === "true")
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const refresh = () => {
      try {
        const burner = exportBurner()
        setBurnerAddress(burner?.address?.toLowerCase() ?? null)
      } catch {
        setBurnerAddress(null)
      }
    }
    refresh()
    const off = onBurnerUpdated(refresh)
    window.addEventListener("storage", refresh)
    return () => {
      off()
      window.removeEventListener("storage", refresh)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem(VIEW_MODE_KEY)
    if (stored === "tech" || stored === "fun") {
      setViewMode(stored)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(RELAYER_TOGGLE_KEY, relayerEnabled ? "true" : "false")
  }, [relayerEnabled])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(VIEW_MODE_KEY, viewMode)
  }, [viewMode])

  useEffect(() => {
    if (viewMode === "fun" && action === 2) {
      setAction(0)
    }
  }, [viewMode, action])

  useEffect(() => {
    if (!myHand?.length) {
      setHandFanOpen(false)
      return
    }
    setHandFanOpen(false)
    const id = requestAnimationFrame(() => setHandFanOpen(true))
    return () => cancelAnimationFrame(id)
  }, [myHand, handUpdatedAt])

  useEffect(() => {
    setCachedCallCard(0)
    setMyHand(null)
    setHandUpdatedAt(null)
    setHandStale(false)
    setLastHandSignature(null)
  }, [gameKey])

  const { data: gameData, isLoading: loadingGame } = useQuery({
    queryKey: ["game-data", chainId, gameKey],
    enabled: Boolean(publicClient && gameId),
    refetchInterval: 10_000,
    queryFn: async () => {
      if (!publicClient || !gameId) return null
      const game = await readGameData(
        publicClient,
        contracts.cardEngine as Address,
        gameId,
      )
      if (game.gameCreator.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
        return null
      }
      return {
        gameCreator: game.gameCreator,
        callCard: game.callCard,
        playerTurnIdx: game.playerTurnIdx,
        status: game.status,
        playersLeftToJoin: game.playersLeftToJoin,
        playersJoined: game.playersJoined,
        maxPlayers: game.maxPlayers,
        ruleset: game.ruleset,
        marketDeckMap: game.marketDeckMap,
      } satisfies GameData
    },
  })

  useEffect(() => {
    if (!gameData) return
    if (gameData.callCard && gameData.callCard !== 0) {
      setCachedCallCard(gameData.callCard)
    }
  }, [gameData])

  const { data: players = [], isLoading: loadingPlayers } = useQuery({
    queryKey: ["players", chainId, gameKey, gameData?.maxPlayers ?? 0],
    enabled: Boolean(publicClient && gameId && gameData),
    refetchInterval: 10_000,
    queryFn: async () => {
      if (!publicClient || !gameId || !gameData) return []
      const rows: PlayerRow[] = []
      for (let i = 0; i < gameData.maxPlayers; i++) {
        const player = await readPlayerData(
          publicClient,
          contracts.cardEngine as Address,
          gameId,
          BigInt(i),
        )
        rows.push({
          index: i,
          addr: player.playerAddr,
          score: player.score,
          deckMap: player.deckMap,
          pendingAction: player.pendingAction,
          forfeited: player.forfeited,
          cards: deckMapToIndexes(player.deckMap),
          hand0: player.hand0,
          hand1: player.hand1,
        })
      }
      return rows
    },
  })

  const me = players.find((p) => p.addr.toLowerCase() === (address ?? "").toLowerCase())
  const funPlayers = useMemo(() => {
    if (!me) return players
    return players.filter((player) => player.index !== me.index)
  }, [players, me])
  const isSpectator = !me
  const isCreator =
    Boolean(gameData?.gameCreator) &&
    gameData?.gameCreator.toLowerCase() === (address ?? "").toLowerCase()
  const canJoin =
    Boolean(gameData) &&
    gameData.status === 0 &&
    !me &&
    gameData.playersLeftToJoin > 0
  const canStart =
    Boolean(gameData) &&
    gameData.status === 0 &&
    (gameData.playersLeftToJoin === 0 || (isCreator && gameData.playersJoined > 1))
  const gameStarted = gameData?.status === 1
  const isMyTurn = Boolean(me && gameData && gameData.playerTurnIdx === me.index)
  const canPlayTurn = Boolean(gameStarted && isMyTurn)
  const canForfeit = Boolean(gameStarted && me)
  const canRelayStart =
    Boolean(gameData) &&
    gameData.status === 0 &&
    gameData.playersLeftToJoin === 0
  const needsCommit = action === 0 || action === 1
  const canRevealHand = Boolean(gameStarted && me && isConnected && fheStatus === "ready")
  const revealBlockReason = useMemo(() => {
    if (isRevealingHand) return "Reveal in progress"
    if (!isConnected) return "Connect your wallet"
    if (!me) return "Join the game to reveal"
    if (!gameStarted) return "Game not started yet"
    if (fheStatus !== "ready") return "FHE relayer not ready"
    return null
  }, [fheStatus, gameStarted, isConnected, isRevealingHand, me])
  const callCardOnChain = gameData?.callCard ?? 0
  const callCardDisplay = callCardOnChain || cachedCallCard
  const callCardIsCached = callCardOnChain === 0 && cachedCallCard !== 0
  const callCardHint = callCardDisplay
    ? callCardIsCached
      ? "Last played card"
      : "Match the call card"
    : "No call card yet"
  const isBurnerConnected = Boolean(
    burnerAddress && address && burnerAddress === address.toLowerCase(),
  )
  const currentHandSignature = useMemo(() => {
    if (!me) return null
    return `${me.deckMap.toString()}-${me.hand0.toString()}-${me.hand1.toString()}`
  }, [me?.deckMap, me?.hand0, me?.hand1])
  const hasPendingCommit = Boolean(pendingProofData)
  const actionLabel = ACTIONS.find((item) => item.value === action)?.label ?? "Play"
  const pendingActionLabel =
    ACTIONS.find((item) => item.value === (pendingAction ?? action))?.label ?? actionLabel
  const canCommitSelected = Boolean(
    isConnected &&
      canPlayTurn &&
      needsCommit &&
      fheStatus === "ready" &&
      !commitMove.isPending &&
      !isDecrypting &&
      !hasPendingCommit,
  )
  const canExecutePending = Boolean(
    isConnected && canPlayTurn && pendingProofData && !executeMove.isPending,
  )
  const canDraw = Boolean(
    isConnected && canPlayTurn && !executeMove.isPending && !isDecrypting && !hasPendingCommit,
  )
  const parsedCardIndex = parseCardIndex(cardIndex)
  const selectedCardIndex =
    pendingCardIndex ?? (parsedCardIndex !== null ? Number(parsedCardIndex) : null)
  const selectedCard = useMemo(() => {
    if (!myHand || selectedCardIndex === null) return null
    return myHand.find((card) => card.index === selectedCardIndex) ?? null
  }, [myHand, selectedCardIndex])
  const wishAction = pendingAction ?? action
  const shouldShowWishShape = Boolean(wishAction === 0 && selectedCard?.shape === "Whot")

  useEffect(() => {
    setMyHand(null)
    setHandError(null)
    setHandUpdatedAt(null)
  }, [me?.deckMap?.toString(), gameData?.marketDeckMap?.toString(), address])

  const parseClearValue = (value: unknown): bigint => {
    if (typeof value === "bigint") return value
    if (typeof value === "number") return BigInt(value)
    if (typeof value === "string") {
      try {
        return BigInt(value)
      } catch {
        return 0n
      }
    }
    return 0n
  }

  const handleRevealHand = useCallback(async () => {
    if (!gameData || !me || !address) return
    if (!isConnected) {
      toast.error("Connect your wallet to decrypt your hand")
      return
    }
    if (fheStatus !== "ready") {
      toast.error("FHE relayer not ready")
      return
    }
    setIsRevealingHand(true)
    setHandError(null)
    try {
      const handle0 = toHex(me.hand0, { size: 32 }) as `0x${string}`
      const handle1 = toHex(me.hand1, { size: 32 }) as `0x${string}`
      const existing = getFheKeypair(chainId, address)
      const keys = existing ?? generateKeypair()
      if (!existing) {
        saveFheKeypair(chainId, address, {
          publicKey: keys.publicKey as `0x${string}`,
          privateKey: keys.privateKey as `0x${string}`,
        })
      }
      const startTimestamp = Math.floor(Date.now() / 1000) - 5
      const durationDays = 1
      const contractAddresses = [contracts.cardEngine]
      const typedData = createEip712(
        keys.publicKey,
        contractAddresses,
        startTimestamp,
        durationDays,
      )
      const signature = await signTypedDataAsync(typedData as any)
      const clearValues = await userDecrypt({
        handles: [
          { handle: handle0, contractAddress: contracts.cardEngine },
          { handle: handle1, contractAddress: contracts.cardEngine },
        ],
        privateKey: keys.privateKey,
        publicKey: keys.publicKey,
        signature,
        contractAddresses,
        userAddress: address,
        startTimestamp,
        durationDays,
      })
      const clear0 = parseClearValue(clearValues[handle0])
      const clear1 = parseClearValue(clearValues[handle1])
      const cards = decodeHandCards(me.deckMap, clear0, clear1)
      setMyHand(cards)
      setHandUpdatedAt(Date.now())
      setHandStale(false)
      setLastHandSignature(`${me.deckMap.toString()}-${me.hand0.toString()}-${me.hand1.toString()}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Hand decrypt failed"
      setHandError(message)
      toast.error("Hand decrypt failed", { description: message })
    } finally {
      setIsRevealingHand(false)
    }
  }, [
    address,
    gameData,
    isConnected,
    me,
    fheStatus,
    chainId,
    contracts.cardEngine,
    generateKeypair,
    saveFheKeypair,
    getFheKeypair,
    createEip712,
    signTypedDataAsync,
    userDecrypt,
  ])

  useEffect(() => {
    if (!isBurnerConnected) return
    if (!canRevealHand || isRevealingHand) return
    if (!currentHandSignature || currentHandSignature === lastHandSignature) return
    if (!handStale && myHand?.length) return
    if (autoRevealRef.current) return
    autoRevealRef.current = true
    const id = setTimeout(async () => {
      try {
        await handleRevealHand()
      } finally {
        autoRevealRef.current = false
      }
    }, 600)
    return () => clearTimeout(id)
  }, [
    handStale,
    myHand?.length,
    isBurnerConnected,
    canRevealHand,
    isRevealingHand,
    currentHandSignature,
    lastHandSignature,
    handleRevealHand,
  ])

  const handleCommit = async (indexOverride?: bigint, actionOverride?: number) => {
    if (!gameId) return
    const commitAction = actionOverride ?? action
    if (commitAction === 2) {
      toast.error("Select Play or Defend to commit a card")
      return
    }
    const parsedIndex = indexOverride ?? parseCardIndex(cardIndex)
    if (parsedIndex === null) {
      toast.error("Enter a valid card index")
      return
    }
    if (fheStatus !== "ready") {
      toast.error("FHE relayer not ready", { description: "Connect a wallet and try again." })
      return
    }
    setPendingProofData(null)
    setPendingCardIndex(null)
    setPendingAction(null)
    setIsDecrypting(true)
    try {
      setCardIndex(parsedIndex.toString())
      const tx = await commitMove.mutateAsync({
        gameId,
        cardIndex: parsedIndex,
      })
      const parsed = parseEventLogs({
        abi: cardEngineAbi,
        eventName: "MoveCommitted",
        logs: tx.receipt.logs,
      })
      const event = parsed[0]
      const encryptedCard = event?.args?.cardToCommit as `0x${string}` | undefined
      const committedIdx = event?.args?.cardIndex as bigint | undefined
      if (!encryptedCard || committedIdx === undefined) {
        throw new Error("MoveCommitted event not found")
      }
      const decrypted = await publicDecrypt([encryptedCard])
      const indexValue = Number(committedIdx)
      if (!Number.isFinite(indexValue) || indexValue < 0 || indexValue > 255) {
        throw new Error("Committed card index out of range")
      }
      const proofData = encodeAbiParameters(
        [
          { type: "bytes" },
          { type: "bytes32" },
          { type: "bytes" },
          { type: "uint8" },
        ],
        [decrypted.decryptionProof, encryptedCard, decrypted.abiEncodedClearValues, indexValue],
      ) as `0x${string}`
      setPendingProofData(proofData)
      setPendingCardIndex(indexValue)
      setPendingAction(commitAction)
      toast.success("Move committed", { description: "Decryption proof ready. Execute your action." })
    } catch (err) {
      toast.error("Commit failed", { description: describeViemError(err) })
    } finally {
      setIsDecrypting(false)
    }
  }

  const handleExecute = async (actionOverride?: number) => {
    if (!gameId) return
    const executeAction = actionOverride ?? pendingAction ?? action
    const needsProof = executeAction === 0 || executeAction === 1
    if (needsProof && !pendingProofData) {
      toast.error("Commit and decrypt a card before executing Play/Defend")
      return
    }
    let extraData: `0x${string}` = "0x"
    if (executeAction === 0 && wishShape) {
      extraData = encodeAbiParameters([{ name: "shape", type: "uint8" }], [BigInt(wishShape)]) as `0x${string}`
    }
    try {
      await executeMove.mutateAsync({
        gameId,
        action: executeAction,
        proofData: (needsProof ? pendingProofData : "0x") as `0x${string}`,
        extraData,
      })
      setPendingProofData(null)
      setPendingCardIndex(null)
      setPendingAction(null)
      if (myHand?.length) {
        setMyHand(null)
        setHandUpdatedAt(null)
        setHandStale(true)
      }
      queryClient.invalidateQueries({ queryKey: ["game-data", chainId, gameKey] })
      queryClient.invalidateQueries({ queryKey: ["players", chainId, gameKey] })
      toast.success("Execute sent", { description: "Watch for MoveExecuted." })
    } catch (err) {
      toast.error("Execute failed", { description: describeViemError(err) })
    }
  }

  const handleCommitCard = async (index: number, actionOverride?: number) => {
    const nextAction = actionOverride ?? action
    if (!canCommitSelected) {
      if (!isConnected) {
        toast.error("Connect your wallet to play a card")
      } else if (hasPendingCommit) {
        toast.error("Execute or break your committed move first")
      } else if (!canPlayTurn) {
        toast.error("You can play only on your turn")
      }
      return
    }
    if (nextAction === 2) {
      toast.error("Select Play or Defend to commit a card")
      return
    }
    setAction(nextAction)
    await handleCommit(BigInt(index), nextAction)
  }

  const handleDrawFromMarket = async () => {
    if (!gameId) return
    if (!isConnected) {
      toast.error("Connect your wallet to draw")
      return
    }
    if (hasPendingCommit) {
      toast.error("Execute or break your committed move first")
      return
    }
    if (!canPlayTurn) {
      toast.error("You can draw only on your turn")
      return
    }
    try {
      await executeMove.mutateAsync({
        gameId,
        action: 2,
        proofData: "0x",
        extraData: "0x",
      })
      if (myHand?.length) {
        setMyHand(null)
        setHandUpdatedAt(null)
        setHandStale(true)
      }
      queryClient.invalidateQueries({ queryKey: ["game-data", chainId, gameKey] })
      queryClient.invalidateQueries({ queryKey: ["players", chainId, gameKey] })
      toast.success("Draw submitted", { description: "Waiting for MoveExecuted." })
    } catch (err) {
      toast.error("Draw failed", { description: describeViemError(err) })
    }
  }

  const handleBreakCommitment = async () => {
    if (!gameId) return
    if (!isConnected) {
      toast.error("Connect your wallet to break commitment")
      return
    }
    try {
      await breakCommitment.mutateAsync({ gameId })
      setPendingProofData(null)
      setPendingCardIndex(null)
      setPendingAction(null)
      toast.success("Commitment cleared")
    } catch (err) {
      toast.error("Break commitment failed", { description: describeViemError(err) })
    }
  }

  const handleJoin = async () => {
    if (!gameId) return
    try {
      await joinGame.mutateAsync({ gameId })
      toast.success("Joined game")
    } catch (err) {
      toast.error("Join failed", { description: err instanceof Error ? err.message : "Unknown error" })
    }
  }

  const handleStart = async () => {
    if (!gameId) return
    try {
      await startGame.mutateAsync({ gameId })
      toast.success("Game started")
    } catch (err) {
      toast.error("Start failed", { description: err instanceof Error ? err.message : "Unknown error" })
    }
  }

  const handleRelayStart = async () => {
    if (!gameId) return
    setIsRelayingStart(true)
    try {
      const res = await relayGameAction("start", gameId)
      toast.success("Relayed start sent", { description: res.hash })
    } catch (err) {
      toast.error("Relayed start failed", { description: err instanceof Error ? err.message : "Unknown error" })
    } finally {
      setIsRelayingStart(false)
    }
  }

  const joinHandler = handleJoin
  const startHandler = relayerEnabled ? handleRelayStart : handleStart
  const joinBusy = joinGame.isPending
  const startBusy = relayerEnabled ? isRelayingStart : startGame.isPending
  const joinDisabled = !isConnected || joinGame.isPending || !canJoin
  const startDisabled = relayerEnabled
    ? !canRelayStart || isRelayingStart
    : !isConnected || startGame.isPending || !canStart

  const handleForfeit = async () => {
    if (!gameId) return
    try {
      await forfeit.mutateAsync({ gameId })
      toast.success("Forfeit submitted")
    } catch (err) {
      toast.error("Forfeit failed", { description: err instanceof Error ? err.message : "Unknown error" })
    }
  }

  const handleBoot = async () => {
    if (!gameId || !bootTarget) return
    try {
      await bootOut.mutateAsync({ gameId, playerIndex: BigInt(bootTarget) })
      toast.success(`Booted index ${bootTarget}`)
      setBootTarget("")
    } catch (err) {
      toast.error("Boot failed", { description: err instanceof Error ? err.message : "Unknown error" })
    }
  }

  if (!gameId) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-10">
        <Link href="/" className="text-sm text-primary underline">
          ← Back
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Invalid game id</CardTitle>
            <CardDescription>Provide a numeric or hex id in the URL.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div
      className={`mx-auto flex max-w-5xl flex-col px-4 ${
        viewMode === "fun" ? "h-[100svh] overflow-hidden gap-3 py-4" : "gap-4 py-6"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to lobby
        </Link>
        <div className="flex flex-wrap items-center gap-2">
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
              onClick={() => setViewMode("tech")}
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
              onClick={() => setViewMode("fun")}
            >
              Fun
            </Button>
          </div>
          <Badge variant="outline">Game #{gameId.toString()}</Badge>
        </div>
      </div>

      {viewMode === "fun" ? (
        <div className="flex flex-1 min-h-0 flex-col rounded-3xl border border-border bg-card p-4 shadow-sm">

          {loadingGame ? (
            <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading game data...
            </div>
          ) : !gameData ? (
            <div className="mt-6 rounded-xl border border-dashed bg-white p-4 text-sm text-muted-foreground">
              No game data found.
            </div>
          ) : isSpectator ? (
            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-3">
              <div className="flex min-h-0 flex-col gap-4 lg:col-span-2">
                <div className="rounded-3xl border bg-white p-4 shadow-sm">
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
                        <div className="h-24 w-16 shadow-sm transition-transform hover:scale-105">
                          {callCardDisplay ? (
                            <WhotCard
                              variant="face"
                              shape={describeCard(callCardDisplay)}
                              number={callCardDisplay & 0x1f}
                              label={compactCardLabel(callCardDisplay)}
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
                      <div className="flex items-center gap-3">
                        <MarketDeckFan
                          count={marketSize(gameData.marketDeckMap)}
                          canDraw={canDraw}
                          onDraw={handleDrawFromMarket}
                        />
                        <div className="text-xs text-muted-foreground">
                          <div className="font-semibold text-foreground">
                            {marketSize(gameData.marketDeckMap)} cards
                          </div>
                          <div>{canDraw ? "Click to draw" : "Draw on your turn"}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border bg-white p-4 shadow-sm">
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
                    <Button
                      size="sm"
                      onClick={handleRevealHand}
                      disabled={!canRevealHand || isRevealingHand}
                    >
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

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Action</span>
                    <Button
                      size="sm"
                      variant={action === 0 ? "secondary" : "outline"}
                      onClick={() => setAction(0)}
                      disabled={!gameStarted}
                    >
                      Play
                    </Button>
                    <Button
                      size="sm"
                      variant={action === 1 ? "secondary" : "outline"}
                      onClick={() => setAction(1)}
                      disabled={!gameStarted}
                    >
                      Defend
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {needsCommit ? "Click a card to commit" : "Select Play or Defend to commit"}
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
                        <div className="text-muted-foreground">
                          {isDecrypting
                            ? "Decrypting committed card..."
                            : `Proof ready for idx ${pendingCardIndex ?? "?"}`}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleExecute(pendingAction ?? action)}
                            disabled={!canExecutePending}
                          >
                            {executeMove.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Execute {pendingActionLabel}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleBreakCommitment}
                            disabled={!gameStarted || breakCommitment.isPending}
                          >
                            {breakCommitment.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
                        const isEmpty = player.addr.toLowerCase() === ZERO_ADDRESS
                        const isCurrent = gameData.playerTurnIdx === player.index
                        const isMe = me?.index === player.index
                        return (
                          <div
                            key={`fun-player-${player.index}`}
                            className={`rounded-2xl border p-3 transition-colors ${
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
                                  <CopyToClipboard text={player.addr} className="h-5 w-5 text-muted-foreground/50" />
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
                            <div className="mt-3 flex items-center justify-between">
                              <CardFan count={player.cards.length} faded={isEmpty} />
                              <div className="text-xs font-medium text-muted-foreground">
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
                    <div>{isMyTurn ? <span className="text-primary font-bold">It is your turn!</span> : "Waiting for your turn"}</div>
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
                        {relayerEnabled ? `Relayer: ${formatAddr(RELAYER_ADDRESS)}` : "Relayer disabled"}
                      </div>
                    </div>
                  ) : null}
                  {gameStarted ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleForfeit}
                        disabled={!canForfeit || forfeit.isPending}
                      >
                        {forfeit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Forfeit
                      </Button>
                    </div>
                  ) : null}
                  <Button className="mt-4 w-full" variant="secondary" onClick={() => setViewMode("tech")}>
                    Go to tech controls
                  </Button>
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
                             disabled={!isConnected || bootOut.isPending}
                           >
                             {bootOut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <div className="rounded-3xl border bg-white p-3 shadow-sm">
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
                        disabled={!canForfeit || forfeit.isPending}
                      >
                        {forfeit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {funPlayers.map((player) => {
                      const isEmpty = player.addr.toLowerCase() === ZERO_ADDRESS
                      const isCurrent = gameData.playerTurnIdx === player.index
                      const isMe = me?.index === player.index
                      return (
                        <div
                          key={`fun-player-${player.index}`}
                          className={`rounded-2xl border p-3 transition-colors ${
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
                          <div className="mt-3 flex items-center justify-between">
                            <CardFan count={player.cards.length} faded={isEmpty} />
                            <div className="text-xs font-medium text-muted-foreground">
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
                      <span>Start via relayer</span>
                      <Switch checked={relayerEnabled} onCheckedChange={setRelayerEnabled} />
                      <span>{relayerEnabled ? "Relayer pays gas" : "Wallet pays gas"}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {relayerEnabled ? `Relayer: ${formatAddr(RELAYER_ADDRESS)}` : "Relayer disabled"}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-3xl border bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">Table</div>
                    <div className="text-sm font-semibold">
                      {["Open", "Started", "Ended"][gameData.status] ?? "Unknown"} | Turn #
                      {gameData.playerTurnIdx}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Seats {gameData.playersJoined}/{gameData.maxPlayers}
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">Call card</div>
                    <div className="flex items-center gap-3">
                      <div className="h-24 w-16 shadow-sm transition-transform hover:scale-105">
                        {callCardDisplay ? (
                          <WhotCard
                            variant="face"
                            shape={describeCard(callCardDisplay)}
                            number={callCardDisplay & 0x1f}
                            label={compactCardLabel(callCardDisplay)}
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
                    <div className="flex items-center gap-3">
                      <MarketDeckFan
                        count={marketSize(gameData.marketDeckMap)}
                        canDraw={canDraw}
                        onDraw={handleDrawFromMarket}
                      />
                      <div className="text-xs text-muted-foreground">
                        <div className="font-semibold text-foreground">
                          {marketSize(gameData.marketDeckMap)} cards
                        </div>
                        <div>{canDraw ? "Click to draw" : "Draw on your turn"}</div>
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
                        disabled={!isConnected || bootOut.isPending}
                      >
                        {bootOut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Boot
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col rounded-3xl border bg-white p-4 shadow-sm">
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
                    <Button
                      size="sm"
                      onClick={handleRevealHand}
                      disabled={!canRevealHand || isRevealingHand}
                    >
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

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Action</span>
                  <Button
                    size="sm"
                    variant={action === 0 ? "secondary" : "outline"}
                    onClick={() => setAction(0)}
                    disabled={!gameStarted}
                  >
                    Play
                  </Button>
                  <Button
                    size="sm"
                    variant={action === 1 ? "secondary" : "outline"}
                    onClick={() => setAction(1)}
                    disabled={!gameStarted}
                  >
                    Defend
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {needsCommit ? "Click a card to commit" : "Select Play or Defend to commit"}
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

                <div className="mt-3 flex-1 min-h-0">
                  {!gameStarted ? (
                    <p className="text-xs text-muted-foreground">Start the game to receive cards.</p>
                  ) : !me ? (
                    <p className="text-xs text-muted-foreground">Join the game to see your hand.</p>
                  ) : myHand?.length ? (
                    <HandFan
                      cards={myHand}
                      canSelect={canCommitSelected}
                      pendingIndex={pendingCardIndex}
                      actionLabel={actionLabel}
                      open={handFanOpen}
                      onSelect={handleCommitCard}
                    />
                  ) : (
                    <div className="flex items-center gap-4">
                      <CardFan count={me?.cards.length ?? 0} faded={false} />
                      <p className="text-xs text-muted-foreground">
                        Reveal your hand to view card faces.
                      </p>
                    </div>
                  )}
                </div>

                {hasPendingCommit || isDecrypting ? (
                  <div className="mt-3 rounded-2xl border border-border bg-secondary/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="text-muted-foreground">
                        {isDecrypting
                          ? "Decrypting committed card..."
                          : `Proof ready for idx ${pendingCardIndex ?? "?"}`}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleExecute(pendingAction ?? action)}
                          disabled={!canExecutePending}
                        >
                          {executeMove.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Execute {pendingActionLabel}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleBreakCommitment}
                          disabled={!gameStarted || breakCommitment.isPending}
                        >
                          {breakCommitment.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
      ) : null}

      {viewMode === "tech" ? (
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
                <Badge variant="outline">Status: {["Open", "Started", "Ended"][gameData.status] ?? "Unknown"}</Badge>
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
                      ? `Relayer: ${formatAddr(RELAYER_ADDRESS)} (start only)`
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
              Call card:{" "}
              {gameData
                ? callCardDisplay
                  ? describeCard(callCardDisplay)
                  : "No call card yet (any card can be played)"
                : "—"}
            </div>
            <Button onClick={handleRevealHand} disabled={!canRevealHand || isRevealingHand}>
              {isRevealingHand ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {myHand?.length ? "Refresh hand" : "Reveal hand"}
            </Button>
            {handStale ? (
              <span className="text-xs text-muted-foreground">Hand changed. Reveal again.</span>
            ) : null}
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
              <div
                key={p.index}
                className="flex flex-col gap-2 rounded-lg border p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">#{p.index}</Badge>
                    <span className="font-medium">
                      {p.addr.toLowerCase() === ZERO_ADDRESS ? "Empty slot" : p.addr}
                    </span>
                    {p.forfeited ? <Badge variant="destructive">Forfeited</Badge> : null}
                    {me?.index === p.index ? <Badge>Me</Badge> : null}
                  </div>
                  <div className="text-muted-foreground text-xs">Score {p.score}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.cards.length
                    ? p.cards.map((idx) => (
                        <Badge key={idx} variant="secondary">
                          idx {idx}
                        </Badge>
                      ))
                    : (
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
          <CardDescription>
            Commit first, then execute. Whot wishes appear only when you play a Whot card.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className={`grid gap-3 ${shouldShowWishShape ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Action</label>
              <Select value={action.toString()} onValueChange={(val) => setAction(Number(val))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIONS.map((act) => (
                    <SelectItem key={act.value} value={act.value.toString()}>
                      {act.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Card index (from your hand map)</label>
              <Input value={cardIndex} onChange={(e) => setCardIndex(e.target.value)} placeholder="e.g. 12" />
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
            {isDecrypting
              ? "Decrypting committed card..."
              : pendingProofData
                ? `Proof ready for idx ${pendingCardIndex ?? "?"}`
                : "No committed card yet."}
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
                commitMove.isPending ||
                isDecrypting ||
                fheStatus !== "ready" ||
                hasPendingCommit
              }
            >
              {commitMove.isPending || isDecrypting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Commit & decrypt
            </Button>
            <Button
              variant="secondary"
              onClick={handleExecute}
              disabled={
                !isConnected ||
                !canPlayTurn ||
                executeMove.isPending ||
                (needsCommit && !pendingProofData)
              }
            >
              {executeMove.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Execute move
            </Button>
            <Button
              variant="outline"
              onClick={handleBreakCommitment}
              disabled={!isConnected || !gameStarted || !hasPendingCommit || breakCommitment.isPending}
            >
              {breakCommitment.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Break commitment
            </Button>
            <Button variant="ghost" onClick={handleForfeit} disabled={!isConnected || !canForfeit || forfeit.isPending}>
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
            <Button
              variant="outline"
              size="sm"
              onClick={handleBoot}
              disabled={!isConnected || !gameStarted || bootOut.isPending}
            >
              {bootOut.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Boot out
            </Button>
          </div>
        </CardContent>
      </Card>
        </>
      ) : null}
    </div>
  )
}
