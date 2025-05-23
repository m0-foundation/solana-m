import { PublicKey } from '@solana/web3.js';
import { Keccak } from 'sha3';

export interface ProofElement {
  node: number[];
  onRight: boolean;
}

const bufferSort = (a: Buffer, b: Buffer) => {
  const iA = BigInt('0x' + a.toString('hex'));
  const iB = BigInt('0x' + b.toString('hex'));

  if (iA < iB) {
    return -1;
  } else if (iA > iB) {
    return 1;
  } else {
    return 0;
  }
};

export class MerkleTree {
  // Array of raw leaves, stored as buffers
  private rawLeaves: Buffer[];
  // Array of hashed leaves, stored as buffers
  private leaves: Buffer[];
  // Array of arrays of nodes, stored as buffers
  // In ascending order of depth, i.e. 0-index is the leaves
  private tree: Buffer[][] = [];
  private root?: Buffer;
  private depth: number = 0;
  private hasher = new Keccak(256);

  constructor(leaves: PublicKey[]) {
    if (leaves.length === 0) {
      leaves.push(PublicKey.default);
    }
    // Dedupe the leaves
    leaves = [...new Set(leaves)];

    // Process the leaves
    this.rawLeaves = leaves.map((leaf) => leaf.toBuffer());

    // Sort the leaves
    this.rawLeaves.sort(bufferSort);

    // Hash the leaves and store the hashes
    this.leaves = this.rawLeaves.map((leaf) => this._hashLeaf(leaf));

    // Build the tree
    this._updateTree();
  }

  private _updateTree() {
    // Wipe the tree
    this.tree = [];

    // If there are less than two leaves, then we don't need to build a tree
    // The root is the hash of the leaf, or, if empty, the zero value
    let len = this.leaves.length;
    if (len === 0) {
      this.root = this._hashLeaf(PublicKey.default.toBuffer());
      return;
    }
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

  private _hashLeaf(leaf: Buffer): Buffer {
    // Each leaf is prepended with a 0x00 byte
    // as part of a certification of authenticity
    // to guard against second preimage attacks
    this.hasher.update(Buffer.from([0x00]));
    this.hasher.update(leaf);
    let hash = this.hasher.digest();
    this.hasher.reset();
    return hash;
  }

  private _hashNode(one: Buffer, two: Buffer): Buffer {
    // Each pair of nodes is prepended with a 0x01 byte
    // as part of a certification of authenticity
    // to guard against second preimage attacks
    this.hasher.update(Buffer.from([0x01]));
    this.hasher.update(one);
    this.hasher.update(two);
    let hash = this.hasher.digest();
    this.hasher.reset();
    return hash;
  }

  private _getLeafIndex(leaf: Buffer): number {
    for (let i = 0; i < this.rawLeaves.length; i++) {
      if (this.rawLeaves[i].equals(leaf)) {
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

  public getRawLeaves(): PublicKey[] {
    return this.rawLeaves.map((leaf) => new PublicKey(leaf));
  }

  public getTree(): Buffer[][] {
    return this.tree;
  }

  public addLeaf(leaf: PublicKey) {
    const leafBuffer = leaf.toBuffer();

    // Check that the leaf is not already in the tree
    let leafIndex = this._getLeafIndex(leafBuffer);
    if (leafIndex !== -1) {
      throw new Error('Leaf already exists in the tree');
    }

    // Do not allow zero-valued leaves
    if (leaf.equals(PublicKey.default)) {
      throw new Error('Zero-valued leaf found');
    }

    // Add the leaf to the leaves
    this.rawLeaves.push(leafBuffer);

    // Sort the leaves
    this.rawLeaves.sort(bufferSort);

    // Get the index of the leaf hash
    let index = this.rawLeaves.indexOf(leafBuffer);

    // Hash the leaf
    let leafHash = this._hashLeaf(leafBuffer);

    // Insert the leaf hash at the same index
    this.leaves.splice(index, 0, leafHash);

    // If the raw leaves are an odd length, and the leaf is the last one,
    // add the duplicated value to the hashed leaves
    if (this.rawLeaves.length % 2 !== 0) {
      this.leaves.push(this.leaves[this.leaves.length - 1]);
    }

    // Update the tree
    this._updateTree();
  }

  public removeLeaf(leaf: PublicKey) {
    const leafBuffer = leaf.toBuffer();

    // Check that the leaf is in the tree
    let index = this._getLeafIndex(leafBuffer);
    if (index === -1) {
      throw new Error('Leaf not found in the tree');
    }

    // Remove the leaf hash
    if (this.rawLeaves.length % 2 !== 0) {
      // We have to remove the duplicated value
      // from the hashed leaves
      this.leaves.pop();
    }

    this.leaves.splice(index, 1);

    // Remove the raw leaf value
    this.rawLeaves.splice(index, 1);

    // We don't need to sort the leaves, since the tree is already sorted
    // Update the tree
    this._updateTree();
  }

  public getRoot(): number[] {
    return Array.from(this.root ?? []);
  }

  public getInclusionProof(leaf: PublicKey, useDuplicate: boolean = false): { proof: ProofElement[] } {
    const leafBuffer = leaf.toBuffer();

    // Find the index of the leaf in the leaves
    // Note: this handles cases where the last leaf is duplicated in the tree
    // by just sending the first index
    let index = this._getLeafIndex(leafBuffer);
    if (index === -1) {
      throw new Error('Leaf not found in the tree');
    }

    // If the tree has only one leaf, the proof is empty
    if (this.tree.length <= 1) {
      return { proof: [] };
    }

    // If the raw leaves are an odd length, and the leaf is the last one,
    // and the caller wants to use the duplicated value,
    // add one to the index so that the proof uses the duplicated value.
    // This doesn't matter for inclusion proofs, but is necessary for some exclusion proofs.
    const rawLen = this.rawLeaves.length;
    if (rawLen % 2 !== 0 && index === rawLen - 1 && useDuplicate) {
      // console.log("special case triggered");
      index++;
    }

    // console.log("root", this.root);
    // console.log("tree", this.tree);
    // console.log("depth", this.depth);

    // Iterate through the tree constructing the proof
    let proof: Array<ProofElement> = [];
    for (let i = 0; i < this.depth; i++) {
      // console.log("level", i);
      // console.log("index", index);
      // Find the sibling to hash against
      // If the index is even, the sibling is to the right
      // If the index is odd, the sibling is to the left
      let siblingOnRight = index % 2 === 0;
      let siblingIndex = siblingOnRight ? index + 1 : index - 1;
      let sibling = this.tree[i][siblingIndex];

      // console.log("sibling index", siblingIndex);
      // console.log("sibling", sibling);
      // console.log("sibling", Array.from(sibling));

      // Add the neighbor to the proof
      proof.push({
        node: Array.from(sibling),
        onRight: siblingOnRight,
      });

      // Hash the node and the neighbor to get the parent
      let parent = siblingOnRight
        ? this._hashNode(this.tree[i][index], sibling)
        : this._hashNode(sibling, this.tree[i][index]);

      // Find the index of the parent in the next level
      index = this._getTreeIndex(i + 1, parent);

      // If the index is -1, throw an error
      if (index === -1) {
        throw new Error('Parent not found in the tree');
      }
    }

    return { proof };
  }

  public getExclusionProof(leaf: PublicKey): {
    proofs: ProofElement[][];
    neighbors: number[][];
  } {
    let leafBuffer = leaf.toBuffer();

    // console.log("raw leaf", leafBuffer);
    // console.log("raw leaves", this.rawLeaves);
    // console.log("leaves", this.leaves);
    // console.log("tree", this.tree);
    // console.log("root", this.root);

    // Check that the leaf is not in the tree
    let index = this._getLeafIndex(leafBuffer);
    if (index !== -1) {
      throw new Error('Leaf found in the tree');
    }

    // Find the index that the leaf would be at if it was in the tree
    index = 0;
    let len = this.rawLeaves.length;
    for (let i = 0; i < len; i++) {
      if (leafBuffer.compare(this.rawLeaves[i]) === -1) {
        index = i;
        break;
      }

      if (i === len - 1) {
        // If the length is odd, then the last leaf is duplicated
        // and the leaf would be at the end of the tree.
        // The proof needs to use the duplicated value so that the
        // index is correct when comparing against the tree size
        // We have to manually increase this bc the length b/w the
        // raw leaves and the first layer of the tree is different
        index = len % 2 === 0 ? len : len + 1;
      }
    }

    // Get the neighbors for the value and their inclusion proofs
    let neighbors: number[][] = [];
    let proofs: ProofElement[][] = [];

    // Special cases:
    // If the index is 0, then
    // If the tree is empty, then the neighbor is the zero value
    // Else, there is only a right neighbor and it has this index
    if (index === 0) {
      if (this.rawLeaves.length == 0) {
        let neighbor = PublicKey.default.toBuffer();
        neighbors.push(Array.from(neighbor));
        proofs.push([]);
      } else {
        // console.log("special case: less than smallest value");
        let neighbor = this.rawLeaves[index];
        let { proof } = this.getInclusionProof(new PublicKey(neighbor));
        neighbors.push(Array.from(neighbor));
        proofs.push(proof);
      }

      return { proofs, neighbors };
    }

    // If the index is the length of the leaves (or + 1), there is only a left neighbor and it's index is len - 1
    if (index >= len) {
      // console.log("special case: greater than largest value");
      let neighbor = this.rawLeaves[len - 1];
      let { proof } = this.getInclusionProof(new PublicKey(neighbor), true);
      neighbors.push(Array.from(neighbor));
      proofs.push(proof);
      return { proofs, neighbors };
    }

    // Otherwise, the value is between the bounds of the tree and we need to find both neighbors
    // The left neighbor is the raw leaf at the index before the leaf would be at
    // The right neighbor is the raw leaf at the index the leaf would be at
    let leftNeighbor = this.rawLeaves[index - 1];
    let rightNeighbor = this.rawLeaves[index];

    // Generate the inclusion proofs for the neighbors
    let { proof: leftProof } = this.getInclusionProof(new PublicKey(leftNeighbor));
    let { proof: rightProof } = this.getInclusionProof(new PublicKey(rightNeighbor));
    proofs.push(leftProof);
    proofs.push(rightProof);

    neighbors.push(Array.from(leftNeighbor));
    neighbors.push(Array.from(rightNeighbor));

    return { proofs, neighbors };
  }
}
