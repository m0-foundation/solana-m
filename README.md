# Solana M

A Solana-based system for managing and distributing yield to token holders through multiple coordinated programs.

## Programs

![Solana M Programs](assets/solana_m_programs.png)

### Common (`37Bvn81nj7sgETZQxy2vpKjTSR6tGtuGy4gNJhC19F14`)
Shared utilities, constants, and error types used across other programs.

### Mint Master (`7j9tN2dS7CuPfKPFvhh8HWWNgsPgN7jsDdDiPXMrjemb`)
Controls token minting permissions and manages authorized minting entities (portal and distributor).

### Earn (`Ea18o3BKAQD8p3DTZ1mabgJiRM7XkoYtmh9TWgxFv6gh`)
Handles yield distribution logic and earner management. Features include:
- Yield distribution cycles
- Earner registration
- Claim processing
- Earn manager configuration

Yield distribution is restricted to a permissioned `earn_authority`. The Portal starts a claim cycle by propagating the index updates it receives from other chains and calling the Earn program to calculate max yield for the claim cycle. The `earn_authority` calculates individual earner balances over the claim period and distributes using a crank-style mechanism. Once, the `earn_authority` has distributed all the yield for a claim cycle, it closes the cycle and waits for another index propagation. The frequency of the claims can be governed by the `claim_cooldown` period.

### Registrar (`DJ3kM7oLuua6NZjnYgCA8SMFhYc1MJMAZ21HmP52ugD1`)
Manages system configuration through key-value storage and access control lists. These values are set by an admin, which will be configured as the Portal receiving messages from Ethereum mainnet.

### Portal
An external program not included in this repository. It is a fork of the Wormhole Native Token Transfer (NTT) Manager program, customized to allow passing generic messages and a payload with transfers.

## Development Setup

### Prerequisites
- Rust and Cargo
- Node.js and Yarn
- Solana CLI tools
- Anchor CLI

### Install Dependencies
```bash
yarn install
```

### Build Programs
```bash
anchor build
```

### Run Tests
```bash
anchor test
```

### Development Commands
These commands are defined in `package.json` and `Anchor.toml`:

```bash
# Run linting
yarn lint

# Fix linting issues
yarn lint:fix
