// Code generated by protoc-gen-as. DO NOT EDIT.
// Versions:
//   protoc-gen-as v1.3.3

import { Writer, Reader } from "as-proto/assembly";
import { TokenBalanceUpdate } from "./TokenBalanceUpdate";
import { Instruction } from "./Instruction";

export class TokenTransaction {
  static encode(message: TokenTransaction, writer: Writer): void {
    writer.uint32(10);
    writer.string(message.signature);

    const balanceUpdates = message.balanceUpdates;
    for (let i: i32 = 0; i < balanceUpdates.length; ++i) {
      writer.uint32(18);
      writer.fork();
      TokenBalanceUpdate.encode(balanceUpdates[i], writer);
      writer.ldelim();
    }

    const instructions = message.instructions;
    for (let i: i32 = 0; i < instructions.length; ++i) {
      writer.uint32(26);
      writer.fork();
      Instruction.encode(instructions[i], writer);
      writer.ldelim();
    }
  }

  static decode(reader: Reader, length: i32): TokenTransaction {
    const end: usize = length < 0 ? reader.end : reader.ptr + length;
    const message = new TokenTransaction();

    while (reader.ptr < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.signature = reader.string();
          break;

        case 2:
          message.balanceUpdates.push(
            TokenBalanceUpdate.decode(reader, reader.uint32())
          );
          break;

        case 3:
          message.instructions.push(
            Instruction.decode(reader, reader.uint32())
          );
          break;

        default:
          reader.skipType(tag & 7);
          break;
      }
    }

    return message;
  }

  signature: string;
  balanceUpdates: Array<TokenBalanceUpdate>;
  instructions: Array<Instruction>;

  constructor(
    signature: string = "",
    balanceUpdates: Array<TokenBalanceUpdate> = [],
    instructions: Array<Instruction> = []
  ) {
    this.signature = signature;
    this.balanceUpdates = balanceUpdates;
    this.instructions = instructions;
  }
}
