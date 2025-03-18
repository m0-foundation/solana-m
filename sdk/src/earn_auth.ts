import { Keypair, Connection, TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js";
import { MINT, MINT_MULTISIG, PROGRAM_ID, TOKEN_2022_ID } from ".";
import { Earner } from "./earner";
import { Graph } from "./graph";
import { EarnManager } from "./earn_manager";
import { b58, deriveDiscriminator } from "./utils";


class EarnAuthority {
    private connection: Connection;
    private keypair: Keypair

    mint: PublicKey;
    mintMultisig: PublicKey;
    managerCache: Map<PublicKey, EarnManager> = new Map();

    constructor(connection: Connection, keypair: Keypair, mint: PublicKey, mintMultisig: PublicKey) {
        this.connection = connection
        this.keypair = keypair;
        this.mint = mint;
        this.mintMultisig = mintMultisig;
    }

    static fromKeypair(connection: Connection, keypair: Keypair): EarnAuthority {
        return new EarnAuthority(connection, keypair, MINT, MINT_MULTISIG)
    }

    async getAllEarners(): Promise<Earner[]> {
        const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, { filters: [{ memcmp: { offset: 0, bytes: b58(deriveDiscriminator("Earner")) } }] });
        return accounts.map(({ account, pubkey }) => Earner.fromAccountData(this.connection, pubkey, account.data))
    }

    async buildClaimInstruction(earner: Earner): Promise<TransactionInstruction> {
        const weightedBalance = await new Graph().getTimeWeightedBalance(earner.userTokenAccount, earner.lastClaimTimestamp);

        const data = deriveDiscriminator("claim_for", "global");
        data.writeBigInt64LE(weightedBalance, 8);

        // earner might not have a manager
        let earnManagerAccount: PublicKey | undefined;
        let earnManagerTokenAccount: PublicKey | undefined;

        if (earner.earnManager) {
            // get the earner manager from cache or fetch it
            let manager = this.managerCache.get(earner.earnManager)
            if (!manager) {
                manager = await EarnManager.fromManagerAddress(this.connection, earner.earnManager)
                this.managerCache.set(earner.earnManager, manager)
            }

            earnManagerAccount = earner.earnManager;
            earnManagerTokenAccount = manager.feeTokenAccount;
        }

        return new TransactionInstruction({
            programId: PROGRAM_ID,
            keys: this._getClaimForAccounts(earner.userTokenAccount, earnManagerAccount, earnManagerTokenAccount),
            data,
        })
    }

    private _getClaimForAccounts(userTokenAccount: PublicKey, earnManagerAccount?: PublicKey, earnManagerTokenAccount?: PublicKey): AccountMeta[] {
        const [globalAccount] = PublicKey.findProgramAddressSync(
            [Buffer.from("global")],
            PROGRAM_ID
        );
        const [tokenAuthorityAccount] = PublicKey.findProgramAddressSync(
            [Buffer.from("token_authority")],
            PROGRAM_ID
        );
        const [earnerAccount] = PublicKey.findProgramAddressSync(
            [Buffer.from("earner"), userTokenAccount.toBuffer()],
            PROGRAM_ID
        );
        return [
            {
                pubkey: this.keypair.publicKey,
                isWritable: false,
                isSigner: true,
            },
            {
                pubkey: globalAccount,
                isWritable: true,
                isSigner: false,
            },
            {
                pubkey: this.mint,
                isWritable: true,
                isSigner: false,
            },
            {
                pubkey: tokenAuthorityAccount,
                isWritable: false,
                isSigner: false,
            },
            {
                pubkey: userTokenAccount,
                isWritable: true,
                isSigner: false,
            },
            {
                pubkey: earnerAccount,
                isWritable: true,
                isSigner: false,
            },
            {
                pubkey: TOKEN_2022_ID,
                isWritable: false,
                isSigner: false,
            },
            {
                pubkey: this.mintMultisig,
                isWritable: false,
                isSigner: false,
            },
            {
                pubkey: earnManagerAccount ?? PROGRAM_ID,
                isWritable: false,
                isSigner: false,
            },
            {
                pubkey: earnManagerTokenAccount ?? PROGRAM_ID,
                isWritable: !!earnManagerTokenAccount,
                isSigner: false,
            },
        ]
    }

}


export default EarnAuthority;