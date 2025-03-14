import { Connection, GetProgramAccountsFilter, PublicKey } from '@solana/web3.js';
import { Earner, EarnManager, PROGRAM_ID } from './generated';

type Commitment = 'processed' | 'confirmed' | 'finalized';

type AccountResult<T> = {
    account: T;
    pubkey: PublicKey;
};

export class SolanaM {
    private connection: Connection;

    constructor(rpcUrl: string, commitment: Commitment = 'confirmed') {
        this.connection = new Connection(rpcUrl, commitment);
    }

    async getRegistrarEarners(): Promise<AccountResult<Earner>[]> {
        return this._getEarners();
    }

    async getEarners(manager: PublicKey): Promise<AccountResult<Earner>[]> {
        return this._getEarners(manager);
    }

    async getManager(manager: PublicKey): Promise<AccountResult<EarnManager>> {
        const [earnManagerAccount] = PublicKey.findProgramAddressSync(
            [Buffer.from("earn-manager"), manager.toBytes()],
            PROGRAM_ID,
        )
        const account = await EarnManager.fromAccountAddress(this.connection, earnManagerAccount)
        return { account, pubkey: earnManagerAccount }
    }

    private async _getEarners(manager?: PublicKey): Promise<AccountResult<Earner>[]> {
        const filters: GetProgramAccountsFilter[] = [
            { memcmp: { offset: 8, bytes: manager ? '2' : '1' } }, // optional manager field
            { dataSize: 156 },
        ];

        // filter by manager
        if (manager) filters.push({ memcmp: { offset: 9, bytes: manager.toBase58() } });

        const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, { filters });
        return accounts.map(({ account, pubkey }) => ({ account: Earner.fromAccountInfo(account)[0], pubkey })).filter((a) => a.account.isEarning);
    }
}

export default SolanaM;
