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
import { toast } from "sonner"
import { useFhevm } from "@/hooks/useFhevm"

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FunGameView } from "@/components/game/FunGameView"
import { GameHeader } from "@/components/game/GameHeader"
import { TechGameView } from "@/components/game/TechGameView"
import type { GameData, PlayerRow, ViewMode } from "@/components/game/types"
import { cardEngineAbi } from "@/lib/abi/cardEngine"
import { decodeHandCards, deckMapToIndexes, matchesCallCard, type OwnedCard } from "@/lib/cards"
import { useCardGameActions } from "@/hooks/useCardGameActions"
import { readCommitmentHash, readGameData, readPlayerData } from "@/lib/cardEngineView"
import { getContracts } from "@/config/contracts"
import { activeChain } from "@/config/web3Shared"
import { RELAYER_ADDRESS } from "@/config/relayer"
import { relayGameAction } from "@/lib/relay"
import { getFheKeypair, saveFheKeypair } from "@/lib/fheKeys"
import { exportBurner, onBurnerUpdated } from "@/lib/burner"
import { clearPendingCommit, loadPendingCommit, savePendingCommit } from "@/lib/commitmentCache"
import { isCacheValid, loadCachedHand, saveCachedHand } from "@/lib/handCache"
import { useRuleEnforcement } from "@/lib/uiSettings"

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
    error: fheError,
  } = useFhevm()
  const chainId = publicClient?.chain?.id ?? activeChain.id
  const contracts = useMemo(() => getContracts(chainId), [chainId])
  const { enabled: enforceRules } = useRuleEnforcement()

  const [action, setAction] = useState<number>(0)
  const [cardIndex, setCardIndex] = useState("")
  const [wishShape, setWishShape] = useState("")
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
  const [isDrawingFromMarket, setIsDrawingFromMarket] = useState(false)
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
    console.log(pendingAction)
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

  const { data: commitmentHash = 0n, isLoading: loadingCommitment } = useQuery({
    queryKey: ["commitment", chainId, gameKey],
    enabled: Boolean(publicClient && gameId),
    refetchInterval: 10_000,
    queryFn: async () => {
      if (!publicClient || !gameId) return 0n
      return readCommitmentHash(publicClient, contracts.cardEngine as Address, gameId)
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
    gameData?.status === 0 &&
    !me &&
    gameData?.playersLeftToJoin > 0
  const canStart =
    Boolean(gameData) &&
    gameData?.status === 0 &&
    (gameData?.playersLeftToJoin === 0 || (isCreator && gameData?.playersJoined > 1))
  const gameStarted = gameData?.status === 1
  const gameEnded = gameData?.status === 2
  // Find winner: player with lowest card count (fewest cards = lowest score in Whot)
  const winner = useMemo(() => {
    if (!gameEnded || !players.length) return null
    const activePlayers = players.filter(p => !p.forfeited && p.addr !== ZERO_ADDRESS)
    if (!activePlayers.length) return null
    return activePlayers.reduce((best, p) => 
      p.cards.length < best.cards.length ? p : best
    )
  }, [gameEnded, players])
  const isMyTurn = Boolean(me && gameData && gameData.playerTurnIdx === me.index)
  const pendingPickCount = me?.pendingAction ?? 0
  const mustResolvePending = Boolean(gameStarted && isMyTurn && pendingPickCount > 0)
  const canPlayTurn = Boolean(gameStarted && isMyTurn)
  const canForfeit = Boolean(gameStarted && me)
  const canRelayStart =
    Boolean(gameData) &&
    gameData?.status === 0 &&
    gameData?.playersLeftToJoin === 0
  const needsCommit = action === 0 || action === 1
  const canRevealHand = Boolean(gameStarted && me && isConnected && fheStatus === "ready")
  const revealBlockReason = useMemo(() => {
    if (isRevealingHand) return "Reveal in progress"
    if (!isConnected) return "Connect your wallet"
    if (!me) return "Join the game to reveal"
    if (!gameStarted) return "Game not started yet"
    if (fheStatus === "error" && fheError?.message) return `FHE relayer error: ${fheError.message}`
    if (fheStatus !== "ready") return "FHE relayer not ready"
    return null
  }, [fheError?.message, fheStatus, gameStarted, isConnected, isRevealingHand, me])
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
    // Only track player's own hand data, not deckMap which changes on any player's action
    return `${me.hand0.toString()}-${me.hand1.toString()}`
  }, [me?.hand0, me?.hand1])
  const hasStoredProof = Boolean(pendingProofData)
  const hasCommittedOnChain = commitmentHash !== 0n
  const needsProofRegeneration = hasCommittedOnChain && !hasStoredProof
  const hasPendingCommit = hasStoredProof || hasCommittedOnChain
  const actionLabel = ACTIONS.find((item) => item.value === action)?.label ?? "Play"
  const pendingActionLabel =
    ACTIONS.find((item) => item.value === (pendingAction ?? action))?.label ?? actionLabel
  // Only show commit/proof status when it's the current player's turn
  const pendingCommitStatus = !isMyTurn
    ? "Waiting for your turn."
    : isDecrypting
      ? "Decrypting committed card..."
      : pendingProofData
        ? `Proof ready for idx ${pendingCardIndex ?? "?"}`
        : hasCommittedOnChain
          ? "Commitment found. Regenerate proof to execute."
          : "No committed card yet."
  const canCommitSelected = Boolean(
    isConnected &&
      canPlayTurn &&
      needsCommit &&
      fheStatus === "ready" &&
      !commitMove.isPending &&
      !isDecrypting &&
      !hasPendingCommit &&
      !mustResolvePending,
  )
  const canExecutePending = Boolean(
    isConnected && canPlayTurn && pendingProofData && !executeMove.isPending,
  )
  const canDraw = Boolean(
    isConnected && canPlayTurn && !executeMove.isPending && !isDecrypting && !hasPendingCommit,
  )
  const canResolvePending = Boolean(
    mustResolvePending && isConnected && !executeMove.isPending && !isDecrypting && !hasPendingCommit,
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

  // Load cached hand on mount if valid
  useEffect(() => {
    if (!address || !gameId || !me) return
    if (myHand?.length) return // Already have hand
    const cached = loadCachedHand(chainId, gameKey, address)
    if (!cached) return
    // Check if cache matches current on-chain handles
    if (!isCacheValid(cached, me.hand0, me.hand1)) return
    try {
      const clear0 = BigInt(cached.clear0)
      const clear1 = BigInt(cached.clear1)
      const cards = decodeHandCards(me.deckMap, clear0, clear1)
      setMyHand(cards)
      setHandUpdatedAt(parseInt(cached.updatedAt.toString(), 10))
      setLastHandSignature(`${me.hand0.toString()}-${me.hand1.toString()}`)
    } catch {
      // Invalid cache, ignore
    }
  }, [address, chainId, gameId, gameKey, me, myHand?.length])

  // When deckMap changes, mark hand as potentially stale
  // BUT don't clear myHand - let cache logic decide if we need to re-decrypt
  useEffect(() => {
    // Mark hand as stale so UI shows refresh option
    // The cache will be re-validated when user reveals or on auto-reveal
    setHandStale(true)
  }, [me?.deckMap?.toString(), me?.hand0?.toString(), me?.hand1?.toString(), address])
  // Ref to track if we've successfully loaded proof from cache for this game
  const proofLoadedRef = useRef<string | null>(null)
  
  // Load proof from cache ONCE when commitment hash becomes available
  useEffect(() => {
    if (!address || !gameId) return
    // Don't do anything while still loading
    if (loadingCommitment) return
    
    const loadKey = `${gameKey}:${address}`
    
    if (hasCommittedOnChain) {
      // Has commitment - try to load proof from cache (only once per loadKey)
      if (proofLoadedRef.current !== loadKey && !pendingProofData) {
        const cached = loadPendingCommit(chainId, gameKey, address)
        if (cached) {
          setPendingProofData(cached.proofData)
          setPendingCardIndex(cached.cardIndex)
          setPendingAction(cached.action)
        }
        // Mark as loaded whether we found cache or not
        proofLoadedRef.current = loadKey
      }
    } else {
      // No commitment on chain - clear any stale proof state
      // Reset the ref so we can load again if commitment appears later
      if (proofLoadedRef.current === loadKey) {
        proofLoadedRef.current = null
      }
      if (pendingProofData || pendingCardIndex !== null || pendingAction !== null) {
        setPendingProofData(null)
        setPendingCardIndex(null)
        setPendingAction(null)
      }
      clearPendingCommit(chainId, gameKey, address)
    }
  }, [address, chainId, gameId, gameKey, loadingCommitment, hasCommittedOnChain, pendingProofData, pendingCardIndex, pendingAction])

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
    
    // Check cache first - if valid, use cached data without decrypt call
    const cached = loadCachedHand(chainId, gameKey, address)
    if (cached && isCacheValid(cached, me.hand0, me.hand1)) {
      try {
        const clear0 = BigInt(cached.clear0)
        const clear1 = BigInt(cached.clear1)
        const cards = decodeHandCards(me.deckMap, clear0, clear1)
        setMyHand(cards)
        setHandUpdatedAt(Date.now())
        setHandStale(false)
        setHandError(null)
        setLastHandSignature(`${me.hand0.toString()}-${me.hand1.toString()}`)
        return // Successfully restored from cache, no decrypt needed
      } catch {
        // Cache corrupted, fall through to decrypt
      }
    }
    
    // Cache miss or invalid - need to decrypt
    if (fheStatus !== "ready") {
      toast.error("FHE relayer not ready", {
        description: fheError?.message,
      })
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
      setLastHandSignature(`${me.hand0.toString()}-${me.hand1.toString()}`)
      // Cache decrypted values to avoid re-decrypt on reload
      saveCachedHand(chainId, gameKey, address, {
        hand0: me.hand0.toString(),
        hand1: me.hand1.toString(),
        clear0: clear0.toString(),
        clear1: clear1.toString(),
        updatedAt: Date.now(),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Hand decrypt failed"
      setHandError(message)
      // Still set lastHandSignature to prevent continuous retry on error
      setLastHandSignature(`${me.hand0.toString()}-${me.hand1.toString()}`)
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
    gameKey,
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
    if (mustResolvePending) {
      toast.error(`Resolve pending pick ${pendingPickCount} before committing`)
      return
    }
    if (enforceRules && callCardOnChain) {
      const selected = myHand?.find((card) => card.index === Number(parsedIndex))
      if (selected && !matchesCallCard(callCardOnChain, selected)) {
        toast.error("Card does not match the call card")
        return
      }
    }
    if (fheStatus !== "ready") {
      toast.error("FHE relayer not ready", {
        description: fheError?.message ?? "Connect a wallet and try again.",
      })
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
      if (address) {
        savePendingCommit(chainId, gameKey, address, {
          proofData,
          cardIndex: indexValue,
          action: commitAction,
          updatedAt: Date.now(),
        })
      }
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
      toast.error("Missing commitment proof", {
        description: hasCommittedOnChain
          ? "Committed move detected. Break and re-commit to execute."
          : "Commit and decrypt a card before executing Play/Defend.",
      })
      return
    }
    let extraData: `0x${string}` = "0x"
    if (executeAction === 0 && wishShape) {
      extraData = encodeAbiParameters([{ name: "shape", type: "uint8" }], [Number(wishShape)]) as `0x${string}`
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
      if (address) {
        clearPendingCommit(chainId, gameKey, address)
      }
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

  // Regenerate proof from existing commitment (no new transaction needed)
  // Regenerate proof from existing commitment (no new transaction needed)
  const handleRegenerateProof = async () => {
    if (!gameId || !publicClient || !address) return
    if (!isMyTurn) {
      toast.error("Can only regenerate proof for your own turn")
      return
    }
    if (!hasCommittedOnChain) {
      toast.error("No commitment found on-chain")
      return
    }
    if (fheStatus !== "ready") {
      toast.error("FHE relayer not ready", { description: fheError?.message })
      return
    }
    setIsDecrypting(true)
    try {
      // Fetch the MoveCommitted event from chain
      // ABI: event MoveCommitted(uint256 indexed gameId, euint8 cardToCommit, uint256 cardIndex);
      // euint8 is a handle (uint256)
      const logs = await publicClient.getLogs({
        address: contracts.cardEngine as Address,
        event: {
          type: "event",
          name: "MoveCommitted",
          inputs: [
            { indexed: true, name: "gameId", type: "uint256" },
            { indexed: false, name: "cardToCommit", type: "uint256" },
            { indexed: false, name: "cardIndex", type: "uint256" },
          ],
        },
        args: { gameId },
        fromBlock: "earliest",
        toBlock: "latest",
      })
      // Get the most recent commitment for this game
      const latestLog = logs[logs.length - 1]
      if (!latestLog) {
        throw new Error("MoveCommitted event not found")
      }
      
      const encryptedCardHandle = latestLog.args.cardToCommit as bigint
      const committedIdx = latestLog.args.cardIndex as bigint
      
      if (encryptedCardHandle === undefined || committedIdx === undefined) {
        throw new Error("Invalid commitment event data")
      }

      // Convert handle to hex string for publicDecrypt and proof encoding
      const encryptedCardHex = toHex(encryptedCardHandle, { size: 32 })

      // Decrypt using the handle (fhevm expects hex string handle)
      const decrypted = await publicDecrypt([encryptedCardHex])
      
      const indexValue = Number(committedIdx)
      if (!Number.isFinite(indexValue) || indexValue < 0 || indexValue > 255) {
        throw new Error("Committed card index out of range")
      }
      
      // encryptedCardHex is already 32 bytes hex string, suitable for bytes32 encoding
      
      const proofData = encodeAbiParameters(
        [
          { type: "bytes" },
          { type: "bytes32" },
          { type: "bytes" },
          { type: "uint8" },
        ],
        [decrypted.decryptionProof, encryptedCardHex, decrypted.abiEncodedClearValues, indexValue],
      ) as `0x${string}`
      
      setPendingProofData(proofData)
      setPendingCardIndex(indexValue)
      setPendingAction(action) // Use current action selection
      if (address) {
        savePendingCommit(chainId, gameKey, address, {
          proofData,
          cardIndex: indexValue,
          action,
          updatedAt: Date.now(),
        })
      }
      toast.success("Proof regenerated", { description: "You can now execute your move." })
    } catch (err) {
      console.error(err)
      toast.error("Failed to regenerate proof", { description: describeViemError(err) })
    } finally {
      setIsDecrypting(false)
    }
  }

  const handleCommitCard = async (index: number, actionOverride?: number) => {
    const nextAction = actionOverride ?? action
    if (!canCommitSelected) {
      if (!isConnected) {
        toast.error("Connect your wallet to play a card")
      } else if (mustResolvePending) {
        toast.error(`Resolve pending pick ${pendingPickCount} first`)
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
    if (enforceRules && callCardOnChain) {
      const selected = myHand?.find((card) => card.index === index)
      if (selected && !matchesCallCard(callCardOnChain, selected)) {
        toast.error("Card does not match the call card")
        return
      }
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
    setIsDrawingFromMarket(true)
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
    } finally {
      setIsDrawingFromMarket(false)
    }
  }

  const handleResolvePending = async () => {
    if (mustResolvePending) {
      setAction(2)
    }
    await handleDrawFromMarket()
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
      if (address) {
        clearPendingCommit(chainId, gameKey, address)
      }
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
      className={`mx-auto flex max-w-5xl flex-col px-3 sm:px-4 ${
        viewMode === "fun"
          ? "min-h-[100svh] gap-3 py-3 sm:py-4"
          : "gap-4 py-6"
      }`}
    >
      <GameHeader viewMode={viewMode} onViewChange={setViewMode} gameId={gameId} isMounted={isMounted} />
      {viewMode === "fun" ? (
        <FunGameView
          loadingGame={loadingGame}
          gameData={gameData!}
          isSpectator={isSpectator}
          gameStarted={gameStarted}
          gameEnded={gameEnded}
          winner={winner}
          isMyTurn={isMyTurn}
          loadingPlayers={loadingPlayers}
          funPlayers={funPlayers}
          me={me}
          address={address}
          callCardDisplay={callCardDisplay}
          callCardHint={callCardHint}
          canDraw={canDraw}
          mustResolvePending={mustResolvePending}
          pendingPickCount={pendingPickCount}
          canResolvePending={canResolvePending}
          handleResolvePending={handleResolvePending}
          handleDrawFromMarket={handleDrawFromMarket}
          isDrawing={isDrawingFromMarket}
          handleRevealHand={handleRevealHand}
          canRevealHand={canRevealHand}
          isRevealingHand={isRevealingHand}
          revealBlockReason={revealBlockReason}
          handStale={handStale}
          handUpdatedAt={handUpdatedAt}
          handError={handError}
          handFanOpen={handFanOpen}
          myHand={myHand}
          action={action}
          setAction={setAction}
          needsCommit={needsCommit}
          canCommitSelected={canCommitSelected}
          handleCommitCard={handleCommitCard}
          pendingCardIndex={pendingCardIndex}
          actionLabel={actionLabel}
          pendingAction={pendingAction}
          pendingActionLabel={pendingActionLabel}
          shouldShowWishShape={shouldShowWishShape}
          wishShape={wishShape}
          setWishShape={setWishShape}
          selectedCard={selectedCard}
          pendingCommitStatus={pendingCommitStatus}
          hasPendingCommit={hasPendingCommit}
          isDecrypting={isDecrypting}
          canExecutePending={canExecutePending}
          executePending={executeMove.isPending}
          breakPending={breakCommitment.isPending}
          needsProofRegeneration={needsProofRegeneration}
          handleRegenerateProof={handleRegenerateProof}
          handleExecute={handleExecute}
          handleBreakCommitment={handleBreakCommitment}
          joinHandler={joinHandler}
          startHandler={startHandler}
          joinDisabled={joinDisabled}
          joinBusy={joinBusy}
          startDisabled={startDisabled}
          startBusy={startBusy}
          relayerEnabled={relayerEnabled}
          setRelayerEnabled={setRelayerEnabled}
          relayerAddress={RELAYER_ADDRESS}
          bootTarget={bootTarget}
          setBootTarget={setBootTarget}
          handleBoot={handleBoot}
          bootPending={bootOut.isPending}
          isConnected={isConnected}
          canForfeit={canForfeit}
          forfeitPending={forfeit.isPending}
          handleForfeit={handleForfeit}
          setViewMode={setViewMode}
          fheStatus={fheStatus}
          formatAddr={formatAddr}
          zeroAddress={ZERO_ADDRESS}
        />
      ) : null}
      {viewMode === "tech" ? (
        <TechGameView
          loadingGame={loadingGame}
          gameData={gameData!}
          callCardDisplay={callCardDisplay}
          isMyTurn={isMyTurn}
          isSpectator={isSpectator}
          joinHandler={joinHandler}
          startHandler={startHandler}
          joinDisabled={joinDisabled}
          joinBusy={joinBusy}
          startDisabled={startDisabled}
          startBusy={startBusy}
          relayerEnabled={relayerEnabled}
          setRelayerEnabled={setRelayerEnabled}
          relayerAddress={RELAYER_ADDRESS}
          gameStarted={gameStarted}
          handleRevealHand={handleRevealHand}
          canRevealHand={canRevealHand}
          isRevealingHand={isRevealingHand}
          handStale={handStale}
          revealBlockReason={revealBlockReason}
          handUpdatedAt={handUpdatedAt}
          handError={handError}
          myHand={myHand}
          me={me}
          players={players}
          loadingPlayers={loadingPlayers}
          zeroAddress={ZERO_ADDRESS}
          mustResolvePending={mustResolvePending}
          pendingPickCount={pendingPickCount}
          handleResolvePending={handleResolvePending}
          canResolvePending={canResolvePending}
          canDraw={canDraw}
          handleDrawFromMarket={handleDrawFromMarket}
          isDrawing={isDrawingFromMarket}
          action={action}
          setAction={setAction}
          cardIndex={cardIndex}
          setCardIndex={setCardIndex}
          shouldShowWishShape={shouldShowWishShape}
          wishShape={wishShape}
          setWishShape={setWishShape}
          pendingCommitStatus={pendingCommitStatus}
          needsCommit={needsCommit}
          isConnected={isConnected}
          canPlayTurn={canPlayTurn}
          commitPending={commitMove.isPending}
          isDecrypting={isDecrypting}
          fheStatus={fheStatus}
          hasPendingCommit={hasPendingCommit}
          pendingProofData={pendingProofData}
          executePending={executeMove.isPending}
          breakPending={breakCommitment.isPending}
          handleCommit={handleCommit}
          handleExecute={handleExecute}
          handleBreakCommitment={handleBreakCommitment}
          handleForfeit={handleForfeit}
          canForfeit={canForfeit}
          forfeitPending={forfeit.isPending}
          bootTarget={bootTarget}
          setBootTarget={setBootTarget}
          handleBoot={handleBoot}
          bootPending={bootOut.isPending}
          actions={ACTIONS}
          formatAddr={formatAddr}
        />
      ) : null}
    </div>
  )
}
