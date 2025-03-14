import { Connection, GetProgramAccountsFilter, PublicKey } from '@solana/web3.js';
import { Earner, EarnManager as GeneratedEarnManger, PROGRAM_ID } from './generated';
import BN from 'bn.js';
import { AccountResult } from '.';

export class EarnManager {
    private connection: Connection;

    manager: PublicKey
    pubkey: PublicKey
    isActive: boolean
    feeBps: number
    feeTokenAccount: PublicKey

    private constructor(connection: Connection, manager: PublicKey, pubkey: PublicKey, data: GeneratedEarnManger) {
        this.connection = connection;
        this.manager = manager;
        this.pubkey = pubkey;
        this.isActive = data.isActive;
        this.feeBps = new BN(data.feeBps).toNumber();
        this.feeTokenAccount = data.feeTokenAccount;
    }

    static async fromManagerAddress(connection: Connection, manager: PublicKey): Promise<EarnManager> {
        const [earnManagerAccount] = PublicKey.findProgramAddressSync(
            [Buffer.from("earn-manager"), manager.toBytes()],
            PROGRAM_ID,
        )
        const underlying = await GeneratedEarnManger.fromAccountAddress(connection, earnManagerAccount)
        return new EarnManager(connection, manager, earnManagerAccount, underlying);
    }

    async getEarners(): Promise<AccountResult<Earner>[]> {
        const filters: GetProgramAccountsFilter[] = [
            { memcmp: { offset: 9, bytes: this.manager.toBase58() } },
            { dataSize: 156 },
        ];
        const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, { filters });
        return accounts.map(({ account, pubkey }) => ({ account: Earner.fromAccountInfo(account)[0], pubkey })).filter((a) => a.account.isEarning);
    }
}
