# Whot On-Chain

A fully decentralized, encrypted version of the classic Whot card game, built on Ethereum using Zama FHE (Fully Homomorphic Encryption).

## Features

- **Encrypted Gameplay**: Card values are encrypted on-chain using FHE. Only the player holding the card can view it.
- **Fair Shuffle**: Uses a verifiable, on-chain shuffle via the `TrustedShuffleService`.
- **Dual UI Modes**: 
  - **Classic**: A functional, detailed dashboard.
  - **New**: A polished, immersive game experience.
- **Burner Wallets**: Integrated local burner wallets for seamless testing and play.
- **Multiplayer**: Support for lobbies with 2-8 players.

## Tech Stack

- **Frontend**: Next.js 14, Tailwind CSS, Shadcn UI
- **Blockchain**: Ethereum (Sepolia), Zama FHEVM
- **Libraries**: `fhevmjs`, `wagmi`, `viem`, `tanstack-query`

## Getting Started

### Prerequisites

- Node.js (v18+)
- pnpm

### Installation

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    pnpm install
    ```
3.  Run the development server:
    ```bash
    pnpm dev
    ```
4.  Open [http://localhost:3000](http://localhost:3000).

## UI Modes

The application features two distinct UI modes which can be toggled via the floating button in the bottom-right corner:

-   **New UI**: Features a rich Hero section with animated SVG assets and a polished card design.
-   **Classic UI**: Use this for debugging or if you prefer a denser information layout.

## Smart Contracts

The game logic is powered by the `WhotManager` contract, which orchestrates:
-   Game creation and lobbies.
-   Drawing encrypted hands from the Shuffle Service.
-   Turn management and move verification.
