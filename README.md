# Whot

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

This is the frontend UI for the [card-game](https://github.com/0xnonso/card-game) smart contracts.

The game logic is powered by the on-chain contracts:
-   **CardEngine**: Core game engine handling game state, turns, and move execution.
-   **WhotManager**: Orchestrates game creation, lobbies, and ruleset management.
-   **TrustedShuffleService**: Provides verifiable on-chain card shuffling.

For contract deployment, configuration, and development, see the [card-game repository](https://github.com/0xnonso/card-game).
