import {
  encodeAbiParameters,
  getAddress,
  hexToBigInt,
  keccak256,
  toHex,
  type Address,
  type PublicClient,
} from "viem"

import { cardEngineAbi } from "@/lib/abi/cardEngine"
import { getStorageAtBalanced, readContractBalanced } from "@/lib/rpcPool"

const GAME_DATA_SLOT = 2n
const GAME_ID_SLOT = 1n
const PLAYER_DATA_OFFSET = 4n
const COMMITMENT_SLOT = 0n

const ADDRESS_MASK = (1n << 160n) - 1n
const U64_MASK = (1n << 64n) - 1n
const U40_MASK = (1n << 40n) - 1n
const U16_MASK = (1n << 16n) - 1n
const U8_MASK = (1n << 8n) - 1n

const loadBits = (value: bigint, offset: bigint, mask: bigint) => (value >> offset) & mask

const toAddress = (value: bigint) =>
  getAddress(`0x${value.toString(16).padStart(40, "0")}`)

const hexToBigIntSafe = (value?: `0x${string}`) => {
  if (!value || value === "0x") return 0n
  return hexToBigInt(value)
}

const readStorageSlots = async (
  client: PublicClient,
  cardEngine: Address,
  slots: bigint[],
) => {
  try {
    const values = await Promise.all(
      slots.map((slot) =>
        getStorageAtBalanced({
          address: cardEngine,
          slot: toHex(slot),
        }),
      ),
    )
    return values.map((value) => hexToBigIntSafe(value))
  } catch {
    const values = await Promise.all(
      slots.map((slot) =>
        client.getStorageAt({
          address: cardEngine,
          slot: toHex(slot),
        }),
      ),
    )
    return values.map((value) => hexToBigIntSafe(value))
  }
}

type ExtsloadArgs = readonly [bigint, bigint] | readonly [bigint[]]

const readExtsload = async (
  client: PublicClient,
  cardEngine: Address,
  args: ExtsloadArgs,
) => {
  try {
    return await readContractBalanced({
      address: cardEngine,
      abi: cardEngineAbi,
      functionName: "extsload",
      args,
    })
  } catch {
    return client.readContract({
      address: cardEngine,
      abi: cardEngineAbi,
      functionName: "extsload",
      args,
    })
  }
}

const countPlayersFromStore = (playerStoreMap: bigint) => {
  let raw = playerStoreMap >> 1n
  let count = 0
  while (raw > 0n) {
    count += Number(raw & 1n)
    raw >>= 1n
  }
  return count
}

export type GameDataView = {
  gameCreator: Address
  callCard: number
  playerTurnIdx: number
  status: number
  lastMoveTimestamp: number
  numProposedPlayers: number
  hookPermissions: number
  playerStoreMap: bigint
  playersJoined: number
  playersLeftToJoin: number
  maxPlayers: number
  ruleset: Address
  marketDeckMap: bigint
  initialHandSize: number
}

export type PlayerDataView = {
  playerAddr: Address
  deckMap: bigint
  pendingAction: number
  score: number
  forfeited: boolean
  hand0: bigint
  hand1: bigint
}

export const gameDataSlot = (gameId: bigint) =>
  BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }],
        [gameId, GAME_DATA_SLOT],
      ),
    ),
)

export const commitmentSlot = (gameId: bigint) =>
  BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }],
        [gameId, COMMITMENT_SLOT],
      ),
    ),
  )

export const playerDataSlot = (gameId: bigint, playerIndex: bigint) => {
  const gameSlot = gameDataSlot(gameId)
  const baseSlot = gameSlot + PLAYER_DATA_OFFSET
  const baseHash = BigInt(
    keccak256(encodeAbiParameters([{ type: "uint256" }], [baseSlot])),
  )
  return baseHash + playerIndex * 3n
}

export const decodeGameData = (raw0: bigint, raw1: bigint): GameDataView => {
  const gameCreator = toAddress(loadBits(raw0, 0n, ADDRESS_MASK))
  const callCard = Number(loadBits(raw0, 160n, U8_MASK))
  const playerTurnIdx = Number(loadBits(raw0, 168n, U8_MASK))
  const status = Number(loadBits(raw0, 176n, U8_MASK))
  const lastMoveTimestamp = Number(loadBits(raw0, 184n, U40_MASK))
  const numProposedPlayers = Number(loadBits(raw0, 224n, U8_MASK))
  const hookPermissions = Number(loadBits(raw0, 232n, U8_MASK))
  const playerStoreMap = loadBits(raw0, 240n, U16_MASK)

  const ruleset = toAddress(loadBits(raw1, 0n, ADDRESS_MASK))
  const marketDeckMap = loadBits(raw1, 160n, U64_MASK)
  const initialHandSize = Number(loadBits(raw1, 224n, U8_MASK))
  const playersLeftToJoin = Number(loadBits(raw1, 232n, U8_MASK))

  const playersJoined = countPlayersFromStore(playerStoreMap)
  const maxPlayers = playersJoined + playersLeftToJoin

  return {
    gameCreator,
    callCard,
    playerTurnIdx,
    status,
    lastMoveTimestamp,
    numProposedPlayers,
    hookPermissions,
    playerStoreMap,
    playersJoined,
    playersLeftToJoin,
    maxPlayers,
    ruleset,
    marketDeckMap,
    initialHandSize,
  }
}

export const decodePlayerData = (
  raw0: bigint,
  raw1: bigint,
  raw2: bigint,
): PlayerDataView => {
  const playerAddr = toAddress(loadBits(raw0, 0n, ADDRESS_MASK))
  const deckMap = loadBits(raw0, 160n, U64_MASK)
  // After deckMap (64 bits at 160), pendingAction starts at 224
  const pendingAction = Number(loadBits(raw0, 224n, U8_MASK))
  const score = Number(loadBits(raw0, 232n, U16_MASK))
  const forfeited = loadBits(raw0, 248n, U8_MASK) !== 0n
  return {
    playerAddr,
    deckMap,
    pendingAction,
    score,
    forfeited,
    hand0: raw1,
    hand1: raw2,
  }
}

export const readGameData = async (
  client: PublicClient,
  cardEngine: Address,
  gameId: bigint,
) => {
  const slot = gameDataSlot(gameId)
  let raw0 = 0n
  let raw1 = 0n
  try {
    const raw = await readExtsload(client, cardEngine, [slot, 2n])
    const values = raw as readonly bigint[]
    raw0 = values[0] ?? 0n
    raw1 = values[1] ?? 0n
  } catch {
    const values = await readStorageSlots(client, cardEngine, [slot, slot + 1n])
    raw0 = values[0] ?? 0n
    raw1 = values[1] ?? 0n
  }
  return decodeGameData(raw0 ?? 0n, raw1 ?? 0n)
}

export const readCommitmentHash = async (
  client: PublicClient,
  cardEngine: Address,
  gameId: bigint,
) => {
  const slot = commitmentSlot(gameId)
  try {
    const raw = await readExtsload(client, cardEngine, [slot, 1n])
    const [value] = raw as readonly bigint[]
    return value ?? 0n
  } catch {
    const [value] = await readStorageSlots(client, cardEngine, [slot])
    return value ?? 0n
  }
}

export const readNextGameId = async (
  client: PublicClient,
  cardEngine: Address,
) => {
  try {
    const raw = await readExtsload(client, cardEngine, [GAME_ID_SLOT, 1n])
    const [value] = raw as readonly bigint[]
    return value ?? 0n
  } catch {
    const [value] = await readStorageSlots(client, cardEngine, [GAME_ID_SLOT])
    return value ?? 0n
  }
}

export const readGameDataBatch = async (
  client: PublicClient,
  cardEngine: Address,
  gameIds: bigint[],
  batchSize = 50,
) => {
  const results = new Map<bigint, GameDataView>()
  const uniqueIds = Array.from(new Set(gameIds.filter((id) => id > 0n)))
  for (let i = 0; i < uniqueIds.length; i += batchSize) {
    const slice = uniqueIds.slice(i, i + batchSize)
    const slots: bigint[] = []
    for (const id of slice) {
      const slot = gameDataSlot(id)
      slots.push(slot, slot + 1n)
    }
    if (!slots.length) continue
    let values: readonly bigint[] = []
    try {
      const raw = await readExtsload(client, cardEngine, [slots])
      values = raw as readonly bigint[]
    } catch {
      values = await readStorageSlots(client, cardEngine, slots)
    }
    for (let j = 0; j < slice.length; j++) {
      const raw0 = values[j * 2] ?? 0n
      const raw1 = values[j * 2 + 1] ?? 0n
      results.set(slice[j]!, decodeGameData(raw0, raw1))
    }
  }
  return results
}

export const readPlayerData = async (
  client: PublicClient,
  cardEngine: Address,
  gameId: bigint,
  playerIndex: bigint,
) => {
  const slot = playerDataSlot(gameId, playerIndex)
  let raw0 = 0n
  let raw1 = 0n
  let raw2 = 0n
  try {
    const raw = await readExtsload(client, cardEngine, [slot, 3n])
    const values = raw as readonly bigint[]
    raw0 = values[0] ?? 0n
    raw1 = values[1] ?? 0n
    raw2 = values[2] ?? 0n
  } catch {
    const values = await readStorageSlots(client, cardEngine, [slot, slot + 1n, slot + 2n])
    raw0 = values[0] ?? 0n
    raw1 = values[1] ?? 0n
    raw2 = values[2] ?? 0n
  }
  return decodePlayerData(raw0 ?? 0n, raw1 ?? 0n, raw2 ?? 0n)
}
