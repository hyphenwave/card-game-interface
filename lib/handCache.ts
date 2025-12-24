"use client"

export type CachedHand = {
    hand0: string  // bigint as string
    hand1: string  // bigint as string
    clear0: string // bigint as string
    clear1: string // bigint as string
    updatedAt: number
}

const HAND_CACHE_PREFIX = "whot-hand-cache"

const buildKey = (chainId: number, gameId: string, address: string) =>
    `${HAND_CACHE_PREFIX}:${chainId}:${gameId}:${address.toLowerCase()}`

export const loadCachedHand = (chainId: number, gameId: string, address: string): CachedHand | null => {
    if (typeof window === "undefined") return null
    if (!address) return null
    const key = buildKey(chainId, gameId, address)
    try {
        const raw = window.localStorage.getItem(key)
        if (!raw) return null
        const parsed = JSON.parse(raw) as CachedHand
        // Validate cache has required fields
        if (!parsed?.hand0 || !parsed?.hand1 || !parsed?.clear0 || !parsed?.clear1) return null
        // Cache expires after 24 hours
        if (Date.now() - parsed.updatedAt > 24 * 60 * 60 * 1000) {
            window.localStorage.removeItem(key)
            return null
        }
        return parsed
    } catch {
        return null
    }
}

export const saveCachedHand = (
    chainId: number,
    gameId: string,
    address: string,
    data: CachedHand,
) => {
    if (typeof window === "undefined") return
    if (!address) return
    const key = buildKey(chainId, gameId, address)
    try {
        window.localStorage.setItem(key, JSON.stringify(data))
    } catch {
        // ignore storage failures
    }
}

export const clearCachedHand = (chainId: number, gameId: string, address: string) => {
    if (typeof window === "undefined") return
    if (!address) return
    const key = buildKey(chainId, gameId, address)
    try {
        window.localStorage.removeItem(key)
    } catch {
        // ignore storage failures
    }
}

/**
 * Check if cached hand is still valid for the given on-chain hand handles.
 * Returns true if cache matches current on-chain data.
 */
export const isCacheValid = (cache: CachedHand, hand0: bigint, hand1: bigint): boolean => {
    try {
        return cache.hand0 === hand0.toString() && cache.hand1 === hand1.toString()
    } catch {
        return false
    }
}
