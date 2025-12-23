export type GameData = {
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

export type PlayerRow = {
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

export type ViewMode = "tech" | "fun"
