"use client"

export type PendingCommitCache = {
  proofData: `0x${string}`
  cardIndex: number
  action: number
  updatedAt: number
}

const COMMIT_PREFIX = "whot-pending-commit"

const buildKey = (chainId: number, gameId: string, address: string) =>
  `${COMMIT_PREFIX}:${chainId}:${gameId}:${address.toLowerCase()}`

export const loadPendingCommit = (chainId: number, gameId: string, address: string) => {
  if (typeof window === "undefined") return null
  if (!address) return null
  const key = buildKey(chainId, gameId, address)
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingCommitCache
    if (!parsed?.proofData) return null
    return parsed
  } catch {
    return null
  }
}

export const savePendingCommit = (
  chainId: number,
  gameId: string,
  address: string,
  data: PendingCommitCache,
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

export const clearPendingCommit = (chainId: number, gameId: string, address: string) => {
  if (typeof window === "undefined") return
  if (!address) return
  const key = buildKey(chainId, gameId, address)
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore storage failures
  }
}
