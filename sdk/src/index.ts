import { Connection } from '@solana/web3.js';

export class SolanaM {
    private connection: Connection;

    constructor(rpcUrl: string) {
        this.connection = new Connection(rpcUrl);
    }

    async getRegistrarEarners(): Promise<number> {
        return await this.connection.getSlot();
    }
}

export default SolanaM;
