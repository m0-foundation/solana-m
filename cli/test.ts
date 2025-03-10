import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { Connection, Keypair } from "@solana/web3.js";
import { signSendWait, UniversalAddress } from "@wormhole-foundation/sdk";
import { Command } from "commander";
import Web3 from "web3";
import { keysFromEnv, NttManager } from "./utils";
const abi = require("./abis/hub-portal.json");

async function main() {
  const program = new Command();

  program
    .command("receive-testnet")
    .description("Bridge 5 M from ethereum sepolia to solana devnet")
    .action(async () => {
      const web3 = new Web3(
        new Web3.providers.HttpProvider(process.env.ETH_SEPOLIA_RPC)
      );
      web3.eth.accounts.wallet.add(process.env.EVM_KEY);
      const portal = new web3.eth.Contract(
        abi,
        "0xD925C84b55E4e44a53749fF5F2a5A13F63D128fd"
      );

      const index = await portal.methods.currentIndex().call();
      console.log(`Current index: ${index}`);

      const recipient = bs58.decode(
        "6Z9CUFDEjeFXodLu3dtAB5C1Q5ybYZ1TiLZZVRRRkxnk"
      );
      console.log(`Recipient: 0x${recipient.toString("hex")}`);
      const from = web3.eth.accounts.wallet[0].address;

      const transfer = portal.methods.transfer(5_000_000, 1, recipient);
      const gasPrice = await web3.eth.getGasPrice();
      const gasLimit = await transfer.estimateGas({ from });

      const tx = await transfer.send({
        from,
        value: web3.utils.toWei("0.0001", "ether"),
        gasPrice: gasPrice.toString(),
        gas: Math.ceil(Number(gasLimit) * 1.2).toString(),
      });

      console.log(`Transfer result: ${tx.transactionHash}`);
    });

  program
    .command("send-testnet")
    .description("Bridge 1 M from solana devnet to ethereum sepolia")
    .argument(
      "[string]",
      "recipient evm address",
      "0x12b1A4226ba7D9Ad492779c924b0fC00BDCb6217"
    )
    .argument("[number]", "amount", "100000")
    .action(async (receiver, amount) => {
      const connection = new Connection(process.env.RPC_URL);
      const [owner, mint] = keysFromEnv(["OWNER_KEYPAIR", "MINT_KEYPAIR"]);
      const { ctx, ntt, sender, signer } = NttManager(
        connection,
        owner,
        mint.publicKey
      );

      const outboxItem = Keypair.generate();
      const xferTxs = ntt.transfer(
        sender,
        BigInt(amount),
        {
          address: new UniversalAddress(receiver, "hex"),
          chain: "Sepolia",
        },
        { queue: false, automatic: true, gasDropoff: 0n },
        outboxItem
      );

      const txnIds = await signSendWait(ctx, xferTxs, signer);
      console.log(`Transaction IDs: ${txnIds.map((id) => id.txid)}`);
    });

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
