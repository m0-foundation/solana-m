import { Connection, GetProgramAccountsFilter, PublicKey } from '@solana/web3.js';
import { Earner, PROGRAM_ID } from './generated';
import { EarnManager } from './earn_manager';

type Commitment = 'processed' | 'confirmed' | 'finalized';

export type AccountResult<T> = {
    account: T;
    pubkey: PublicKey;
};

export class SolanaM {
    private connection: Connection;

    constructor(rpcUrl: string, commitment: Commitment = 'confirmed') {
        this.connection = new Connection(rpcUrl, commitment);
    }

    async getRegistrarEarners(): Promise<AccountResult<Earner>[]> {
        const filters: GetProgramAccountsFilter[] = [
            { memcmp: { offset: 8, bytes: '1' } }, // optional manager field is not set
            { dataSize: 156 },
        ];

        const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, { filters });
        return accounts.map(({ account, pubkey }) => ({ account: Earner.fromAccountInfo(account)[0], pubkey })).filter((a) => a.account.isEarning);
    }

    async getManager(manager: PublicKey): Promise<EarnManager> {
        return await EarnManager.fromManagerAddress(this.connection, manager)
    }
}

export default SolanaM;
