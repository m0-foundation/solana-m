
import { PublicKey } from '@solana/web3.js';
import { Keccak } from 'sha3';

export class MerkleTree {
    // Array of raw leaves, stored as buffers
    private rawLeaves: Buffer[];
    // Array of hashed leaves, stored as buffers
    private leaves: Buffer[];
    // Array of arrays of nodes, stored as buffers
    // In ascending order of depth, i.e. 0-index is the leaves
    private tree: Buffer[][];
    private root: Buffer;
    private depth: number;
    private hasher = new Keccak(256);

    constructor (leaves: PublicKey[]) {
        let len = leaves.length;
        this.leaves = new Array(len);
        this.rawLeaves = new Array(len);

        // Process the leaves
        let zippedLeaves = new Array(len);
        for (let i = 0; i < len; i++) {
            // Do not allow zero-valued leaves
            if (leaves[i].equals(PublicKey.default)) {
                throw new Error("Zero-valued leaf found");
            }

            let leafHash = this._hashLeaf(leaves[i]);
            zippedLeaves[i] = [leaves[i].toBuffer(), leafHash];
        }

        // Sort the zipped leaves by the leaf hash
        zippedLeaves.sort((a, b) => a[1].compare(b[1]));

        // Unzip the leaves and store them
        for (let i = 0; i < len; i++) {
            let rawLeaf = zippedLeaves[i][0];
            let hashedLeaf = zippedLeaves[i][1];

            if (this.rawLeaves.includes(rawLeaf)) {
                throw new Error("Duplicate leaf found");
            }
            this.rawLeaves[i] = rawLeaf; 
            this.leaves[i] = hashedLeaf;
        }

        // Build the tree
        this._updateTree();
    }

    private _updateTree() {
        // Wipe the tree
        this.tree = [];

        // If there are less than two leaves, we don't need to build the tree
        let len = this.leaves.length;
        if (len === 0) {
            return;
        };
        if (len === 1) {
            this.tree.push(this.leaves);
            this.root = this.tree[0][0];
            return;
        }

        // Add the leaves as the first level
        // If the number of leaves is odd, duplicate the last leaf
        let leaves = this.leaves;
        if (leaves.length % 2 !== 0) {
            let last = leaves[leaves.length - 1];
            leaves.push(last);
            len++;
        }

        this.tree.push(leaves);

        // Build the tree one level at a time
        // We sort each pair before hashing and add a 0x01 byte before each pair
        // to guard against second preimage attacks
        let level = 0;
        while (len > 1) {
            level++;
            let lastNodes = this.tree[level - 1];
            let lastEven = len % 2 == 0;
            let nextLen = lastEven ? len / 2 : len / 2 + 1;
            let nodes = new Array<Buffer>(nextLen);

            for (let i = 0; i < len - 1; i = i + 2) {
                nodes[i / 2] = this._hashNode(lastNodes[i], lastNodes[i + 1]);
            }

            if (!lastEven) {
                nodes[nextLen - 1] = this._hashNode(lastNodes[len - 1], lastNodes[len - 1]);
            }

            this.tree.push(nodes);
            len = nextLen;
        }

        this.depth = level;
        this.root = this.tree[level][0];
    }

    private _hashLeaf(leaf: PublicKey): Buffer {
        // Each leaf is prepended with a 0x00 byte 
        // as part of a certification of authenticity
        // to guard against second preimage attacks
        this.hasher.update(Buffer.from([0x00]));
        this.hasher.update(leaf.toBuffer());
        let hash = this.hasher.digest();
        this.hasher.reset();
        return hash;
    }

    private _hashNode(one: Buffer, two: Buffer): Buffer {
        // Each pair of nodes is prepended with a 0x01 byte
        // as part of a certification of authenticity
        // to guard against second preimage attacks
        this.hasher.update(Buffer.from([0x01]));
        if (one < two) {
            this.hasher.update(one);
            this.hasher.update(two);
        } else {
            this.hasher.update(two);
            this.hasher.update(one);
        }
        let hash = this.hasher.digest();
        this.hasher.reset();
        return hash;
    }

    private _getLeafIndex(leaf: Buffer): number {
        for (let i = 0; i < this.leaves.length; i++) {
            if (this.leaves[i].equals(leaf)) {
                return i;
            }
        }
        return -1;
    }

    private _getTreeIndex(level: number, node: Buffer): number {
        for (let i = 0; i < this.tree[level].length; i++) {
            if (this.tree[level][i].equals(node)) {
                return i;
            }
        }
        return -1;
    }

    public addLeaf(leaf: PublicKey) {
        // Check that the leaf is not already in the tree
        const leafHash = this._hashLeaf(leaf);

        if (this.leaves.includes(leafHash)){
            throw new Error("Leaf already exists in the tree");
        }

        // Do not allow zero-valued leaves
        if (leaf.equals(PublicKey.default)) {
            throw new Error("Zero-valued leaf found");
        }

        // Add the leaf to the leaves
        this.leaves.push(leafHash);

        // Sort the leaves
        this.leaves.sort();

        // Get the index of the leaf hash
        let index = this.leaves.indexOf(leafHash);

        // Insert the raw leaf value at the same index
        this.rawLeaves.splice(index, 0, leaf.toBuffer());

        // Update the tree
        this._updateTree();
    }

    public removeLeaf(leaf: PublicKey) {
        // Check that the leaf is in the tree
        const leafHash = this._hashLeaf(leaf);

        let index = this.leaves.indexOf(leafHash);
        if (index === -1) {
            throw new Error("Leaf not found in the tree");
        }

        // Remove the leaf hash
        this.leaves.splice(index, 1);

        // Remove the raw leaf value
        this.rawLeaves.splice(index, 1);

        // We don't need to sort the leaves, since the tree is already sorted
        // Update the tree
        this._updateTree();
    }

    public getRoot(): number[] {
        return Array.from(this.root);
    }

    public getInclusionProof(leaf: PublicKey): { proof: number[][] } {
        const leafHash = this._hashLeaf(leaf);

        // Find the index of the leaf in the leaves
        // Note: this handles cases where the last leaf is duplicated in the tree
        // by just sending the first index
        let index = this._getLeafIndex(leafHash);
        if (index === -1) {
            throw new Error("Leaf not found in the tree");
        }

        // console.log("tree", this.tree);
        // console.log("depth", this.depth);

        // Iterate through the tree constructing the proof
        let proof: Array<Array<number>> = [];
        for (let i = 0; i < this.depth; i++) {
            // console.log("level", i);
            // console.log("index", index);
            // Find the neighbor to hash against
            // If the index is even, the neighbor is to the right
            // If the index is odd, the neighbor is to the left
            let neighborIndex = index % 2 === 0 ? index + 1 : index - 1;
            // console.log("neighborIndex", neighborIndex);
            let neighbor = this.tree[i][neighborIndex];

            // Add the neighbor to the proof
            proof.push(Array.from(neighbor));

            // Hash the node and the neighbor to get the parent
            let parent = this._hashNode(this.tree[i][index], neighbor);

            // Find the index of the parent in the next level
            index = this._getTreeIndex(i + 1, parent);

            // If the index is -1, throw an error
            if (index === -1) {
                throw new Error("Parent not found in the tree");
            }
        }

        return { proof };
    }

    public getExclusionProof(leaf: PublicKey): { proof: number[][], sibling: number[] }  {
        const leafHash = this._hashLeaf(leaf);

        console.log("leaf hashes", this.leaves);
        console.log("leaf hash", leafHash);

        // Check that the leaf is not in the tree
        let index = this._getLeafIndex(leafHash);
        if (index !== -1) {
            throw new Error("Leaf found in the tree");
        }

        // Find the index that the leaf would be at if it was in the tree
        index = 0;
        let len = this.leaves.length;
        for (let i = 0; i < len; i++) {
            if (leafHash.compare(this.leaves[i]) === -1) {
                index = i;
                break;
            }

            if (i === len - 1) {
                index = i;
            }
        }

        console.log("sibling index", index);
        console.log("sibling hash", this.leaves[index]);

        // The sibling is the raw leaf that is at the position the leaf would be at
        let sibling = this.rawLeaves[index];

        // Generate the inclusion proof for the sibling
        let { proof } = this.getInclusionProof(new PublicKey(sibling));

        console.log("proof", proof);
        console.log("sibling", sibling);

        return { proof, sibling: Array.from(sibling) };
    }
}   
