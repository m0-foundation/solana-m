import { Connection, GetProgramAccountsFilter, PublicKey } from '@solana/web3.js';
import { EarnManager } from './earn_manager';
import { Earner } from './earner';

type Commitment = 'processed' | 'confirmed' | 'finalized';

export const PROGRAM_ID = new PublicKey('MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c');

export class SolanaM {
    private connection: Connection;

    constructor(rpcUrl: string, commitment: Commitment = 'confirmed') {
        this.connection = new Connection(rpcUrl, commitment);
    }

    async getRegistrarEarners(): Promise<Earner[]> {
        const filters: GetProgramAccountsFilter[] = [
            { memcmp: { offset: 8, bytes: '1' } }, // optional manager field is not set
            { dataSize: 156 },
        ];

        const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, { filters });
        return accounts.map(({ account, pubkey }) => Earner.fromAccountData(this.connection, pubkey, account.data))
    }

    async getManager(manager: PublicKey): Promise<EarnManager> {
        return await EarnManager.fromManagerAddress(this.connection, manager)
    }
}

export default SolanaM;
