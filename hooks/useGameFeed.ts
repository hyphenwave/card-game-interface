import { useQuery } from "@tanstack/react-query"
import { type Address, type PublicClient } from "viem"
import { activeChain } from "@/config/web3Shared"
import { getContracts } from "@/config/contracts"
import { readGameDataBatch, readNextGameId } from "@/lib/cardEngineView"
import { marketSize } from "@/lib/cards"

export type IndexedGame = {
    gameId: bigint
    creator: string
    status: number
    playersLeftToJoin: number
    maxPlayers: number
    callCard: number
    lastMove: number
    ruleset: string
    marketDeckMap: bigint
    marketCount: number
    playerTurnIdx: number
    playersJoined: number
}

type CachedGame = Omit<IndexedGame, "gameId" | "marketDeckMap"> & {
    gameId: string
    marketDeckMap: string
}

type FeedCache = {
    version: number
    chainId: number
    cardEngine: string
    updatedAt: number
    latestGameId: string
    games: CachedGame[]
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
const FEED_CACHE_VERSION = 2
const FEED_CACHE_TTL_MS = 60_000
const FEED_CACHE_PREFIX = "whot-game-feed-cache"
const FEED_MAX_GAMES = 50
const FEED_FALLBACK_GAMES = 50

const buildFeedCacheKey = (chainId: number, cardEngine: string) =>
    `${FEED_CACHE_PREFIX}:${chainId}:${cardEngine.toLowerCase()}`

const safeNumber = (value: unknown, fallback = 0) => {
    const parsed = typeof value === "number" ? value : Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

const serializeGame = (game: IndexedGame): CachedGame => ({
    ...game,
    gameId: game.gameId.toString(),
    marketDeckMap: game.marketDeckMap.toString(),
})

const deserializeGame = (game: CachedGame): IndexedGame | null => {
    try {
        return {
            gameId: BigInt(game.gameId),
            creator: String(game.creator ?? ""),
            status: safeNumber(game.status),
            playersLeftToJoin: safeNumber(game.playersLeftToJoin),
            maxPlayers: safeNumber(game.maxPlayers),
            callCard: safeNumber(game.callCard),
            lastMove: safeNumber(game.lastMove),
            ruleset: String(game.ruleset ?? ""),
            marketDeckMap: BigInt(game.marketDeckMap),
            marketCount: safeNumber(game.marketCount),
            playerTurnIdx: safeNumber(game.playerTurnIdx),
            playersJoined: safeNumber(game.playersJoined),
        }
    } catch {
        return null
    }
}

const loadFeedCache = (key: string) => {
    if (typeof window === "undefined") return null
    try {
        const raw = window.localStorage.getItem(key)
        if (!raw) return null
        const parsed = JSON.parse(raw) as FeedCache
        if (!parsed || parsed.version !== FEED_CACHE_VERSION || !Array.isArray(parsed.games)) {
            return null
        }
        const games = parsed.games
            .map((game) => deserializeGame(game))
            .filter(Boolean) as IndexedGame[]
        return {
            games,
            latestGameId: parsed.latestGameId ? BigInt(parsed.latestGameId) : undefined,
            updatedAt: parsed.updatedAt,
        }
    } catch {
        return null
    }
}

const saveFeedCache = (
    key: string,
    chainId: number,
    cardEngine: string,
    games: IndexedGame[],
    latestGameId?: bigint,
) => {
    if (typeof window === "undefined") return
    try {
        const payload: FeedCache = {
            version: FEED_CACHE_VERSION,
            chainId,
            cardEngine,
            updatedAt: Date.now(),
            latestGameId: (latestGameId ?? 0n).toString(),
            games: games.map(serializeGame),
        }
        window.localStorage.setItem(key, JSON.stringify(payload))
    } catch {
        // ignore cache failures
    }
}

const buildGameIdRange = (start: bigint, end: bigint) => {
    const ids: bigint[] = []
    if (end < start) return ids
    for (let id = start; id <= end; id++) ids.push(id)
    return ids
}

export function useGameFeed(publicClient: PublicClient | undefined) {
    const chainId = publicClient?.chain?.id ?? activeChain.id
    const contracts = getContracts(chainId)
    const cacheKey = buildFeedCacheKey(chainId, contracts.cardEngine)

    // Isolate cache loading to be client-side only or effect-based if needed, 
    // but for initialData we try to read synchronously if possible or just default empty.
    // Since this is a hook, we can just load it.
    const cachedFeed = loadFeedCache(cacheKey)

    return useQuery({
        queryKey: ["game-index", chainId],
        enabled: Boolean(publicClient),
        initialData: cachedFeed?.games ?? [],
        queryFn: async () => {
            if (!publicClient) return []
            const cache = loadFeedCache(cacheKey)
            const cachedGames = cache?.games ?? []
            const cachedLatestGameId = cache?.latestGameId ?? 0n
            const nextGameId = await readNextGameId(publicClient, contracts.cardEngine as Address)

            if (nextGameId <= 1n) {
                if (cachedGames.length) return cachedGames.sort((a, b) => Number(b.gameId - a.gameId))
                const fallbackEnd = BigInt(FEED_FALLBACK_GAMES)
                const fallbackIds = buildGameIdRange(1n, fallbackEnd)
                const fallbackMap = await readGameDataBatch(
                    publicClient,
                    contracts.cardEngine as Address,
                    fallbackIds,
                )
                const fallbackGames: IndexedGame[] = []
                for (const gameId of fallbackIds) {
                    const gameData = fallbackMap.get(gameId)
                    if (!gameData || gameData.gameCreator === ZERO_ADDRESS) continue
                    fallbackGames.push({
                        gameId,
                        creator: gameData.gameCreator,
                        status: gameData.status,
                        playersLeftToJoin: gameData.playersLeftToJoin,
                        maxPlayers: gameData.maxPlayers,
                        callCard: gameData.callCard,
                        lastMove: gameData.lastMoveTimestamp,
                        ruleset: gameData.ruleset,
                        marketDeckMap: gameData.marketDeckMap,
                        marketCount: marketSize(gameData.marketDeckMap),
                        playerTurnIdx: gameData.playerTurnIdx,
                        playersJoined: gameData.playersJoined,
                    })
                }
                const orderedFallback = fallbackGames.sort((a, b) => Number(b.gameId - a.gameId))
                const latestFallback = orderedFallback[0]?.gameId ?? 0n
                saveFeedCache(cacheKey, chainId, contracts.cardEngine, orderedFallback, latestFallback)
                return orderedFallback
            }

            const latestGameId = nextGameId - 1n
            if (
                cachedLatestGameId === latestGameId &&
                cache?.updatedAt &&
                Date.now() - cache.updatedAt < FEED_CACHE_TTL_MS
            ) {
                return cachedGames.sort((a, b) => Number(b.gameId - a.gameId))
            }

            const maxGames = BigInt(FEED_MAX_GAMES)
            const rangeStart = latestGameId > maxGames ? latestGameId - maxGames + 1n : 1n
            const gameIds = buildGameIdRange(rangeStart, latestGameId)
            const dataMap = await readGameDataBatch(publicClient, contracts.cardEngine as Address, gameIds)
            const games: IndexedGame[] = []

            for (const gameId of gameIds) {
                const gameData = dataMap.get(gameId)
                if (!gameData || gameData.gameCreator === ZERO_ADDRESS) continue
                games.push({
                    gameId,
                    creator: gameData.gameCreator,
                    status: gameData.status,
                    playersLeftToJoin: gameData.playersLeftToJoin,
                    maxPlayers: gameData.maxPlayers,
                    callCard: gameData.callCard,
                    lastMove: gameData.lastMoveTimestamp,
                    ruleset: gameData.ruleset,
                    marketDeckMap: gameData.marketDeckMap,
                    marketCount: marketSize(gameData.marketDeckMap),
                    playerTurnIdx: gameData.playerTurnIdx,
                    playersJoined: gameData.playersJoined,
                })
            }

            let ordered = games.sort((a, b) => Number(b.gameId - a.gameId))
            if (!ordered.length && rangeStart !== 1n) {
                const fallbackEnd = latestGameId > maxGames ? maxGames : latestGameId
                const fallbackIds = buildGameIdRange(1n, fallbackEnd)
                const fallbackMap = await readGameDataBatch(
                    publicClient,
                    contracts.cardEngine as Address,
                    fallbackIds,
                )
                const fallbackGames: IndexedGame[] = []
                for (const gameId of fallbackIds) {
                    const gameData = fallbackMap.get(gameId)
                    if (!gameData || gameData.gameCreator === ZERO_ADDRESS) continue
                    fallbackGames.push({
                        gameId,
                        creator: gameData.gameCreator,
                        status: gameData.status,
                        playersLeftToJoin: gameData.playersLeftToJoin,
                        maxPlayers: gameData.maxPlayers,
                        callCard: gameData.callCard,
                        lastMove: gameData.lastMoveTimestamp,
                        ruleset: gameData.ruleset,
                        marketDeckMap: gameData.marketDeckMap,
                        marketCount: marketSize(gameData.marketDeckMap),
                        playerTurnIdx: gameData.playerTurnIdx,
                        playersJoined: gameData.playersJoined,
                    })
                }
                ordered = fallbackGames.sort((a, b) => Number(b.gameId - a.gameId))
            }
            const cacheLatest = ordered[0]?.gameId ?? latestGameId
            saveFeedCache(cacheKey, chainId, contracts.cardEngine, ordered, cacheLatest)
            return ordered
        },
    })
}
