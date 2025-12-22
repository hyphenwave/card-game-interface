import { NextResponse } from "next/server"
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node"
import { WHOT_DECK } from "@/lib/cards"
import { env } from "@/lib/env"
import { getContracts } from "@/config/contracts"

const packLimb = (arr: number[]) =>
  arr.reduce((acc, v, i) => acc | (BigInt(v) << BigInt(i * 8)), 0n)

export async function POST(req: Request) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    // ignore body parse errors; fall back to env/config
  }

  const requestedEngine = body.cardEngine as string | undefined
  const requestedImporter = body.importer as string | undefined
  const chainId = typeof body.chainId === "number" ? body.chainId : env.chainId

  const fallback = getContracts(chainId)
  const cardEngine = requestedEngine || env.cardEngineAddress || fallback.cardEngine || ""
  const importer = requestedImporter || env.whotManagerAddress || fallback.whotManager || ""
  if (!cardEngine || !importer) {
    return NextResponse.json({ error: "Missing contract/importer address" }, { status: 400 })
  }

  try {
    const config = { 
      ...SepoliaConfig,
      chainId: 11155111,
      relayerUrl: "https://relayer.testnet.zama.cloud",
      gatewayUrl: "https://gateway.sepolia.zama.ai/",
    }
    const instance = await createInstance(config)
    const input = instance.createEncryptedInput(cardEngine, importer)
    const limb0 = packLimb(WHOT_DECK.slice(0, 32))
    const limb1 = packLimb(WHOT_DECK.slice(32))
    input.add256(limb0)
    input.add256(limb1)
    const { handles, inputProof } = await input.encrypt()
    return NextResponse.json({ handles, inputProof })
  } catch (err) {
    console.error("encrypt error", err)
    return NextResponse.json({ error: (err as Error).message || "encrypt failed" }, { status: 500 })
  }
}
