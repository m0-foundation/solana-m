// import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorError } from "@coral-xyz/anchor";
import { LiteSVM } from "litesvm";
import { fromWorkspace, LiteSVMProvider } from "anchor-litesvm";
import {
	PublicKey,
	Keypair,
	LAMPORTS_PER_SOL,
	SystemProgram,
} from "@solana/web3.js";
// import { airdropIfRequired } from "@solana-developers/helpers";
import { loadKeypair, toFixedSizedArray } from "../test-utils";

import { Registrar } from "../../target/types/registrar";
const REGISTRAR_IDL = require("../../target/idl/registrar.json");

// Unit tests for registrar
// [X] set_key
//   [X] given the key register does not exist yet
//      [X] given the admin signs the transaction
//         [X] the key register is created
//         [X] the value is set to the new value
//      [X] given the admin does not sign the transaction
//         [X] the transaction reverts with an address constraint error on the signer account
//   [X] given the key register already exists
//      [X] given the admin signs the transaction
//         [X] the value is set to the new value
//      [X] given the admin does not sign the transaction
//         [X] the transaction reverts with an address constraint error on the signer account
//   [X] given a key has been set and deleted
//      [X] given the admin signs the transaction
//         [X] the key register is created and the value is set to the new value
//
// [X] delete_key
//   [X] given the key register does not exist yet
//      [X] given the admin signs the transaction
//         [X] the transaction reverts with ?
//      [X] given the admin does not sign the transaction
//         [X] the transaction reverts with ?
//   [X] given the key register already exists
//      [X] given the admin signs the transaction
//         [X] the key register account is closed
//      [X] given the admin does not sign the transaction
//         [X] the transaction reverts with an address constraint error on the signer account
//
// [X] add_to_list
//   [X] given the flag account does not exist yet
//      [X] given the admin signs the transaction
//         [X] the flag account is created and the value set to true
//      [X] given the admin does not sign the transaction
//         [X] the transaction reverts with an address constraint error on the signer account
//   [X] given the flag account already exists
//      [X] given the admin signs the transaction
//         [X] the transaction reverts with an account already exists error
//      [X] given the admin does not sign the transaction
//         [X] the transaction reverts with an address constraint error on the signer account
//   [X] given a flag account was initialized and then closed
//      [X] given the admin signs the transaction
//         [X] the flag account is created and the value set to true
//
// [X] remove_from_list
//   [X] given the flag account does not exist yet
//      [X] given the admin signs the transaction
//         [X] the transaction reverts with an account does not exist error
//      [X] given the admin does not sign the transaction
//         [X] the transaction reverts with an address constraint error on the signer account
//   [X] given the flag account already exists
// 	    [X] given the admin signs the transaction
//         [X] the flag account is closed? or should it be set to false so the portal doesn't receive the refund?
//      [X] given the admin does not sign the transaction
//         [X] the transaction reverts with an address constraint error on the signer account


// Setup wallets once at the beginning of the test suite
const admin: Keypair = loadKeypair("test-addr/portal.json");
const nonAdmin: Keypair = new Keypair();

// Use a fresh SVM instance for each unit test
// const provider = anchor.AnchorProvider.env();
// const svm = provider.connection;

let svm: LiteSVM;
let provider: LiteSVMProvider;
let accounts: Record<string, PublicKey> = {};
let registrar: Program<Registrar>;

// Utility functions for the tests
const expectAccountEmpty = (account: PublicKey) => {
	const accountInfo = svm.getAccount(account);

	if (accountInfo) {
		expect(accountInfo.lamports).toBe(0);
		expect(accountInfo.data.length).toBe(0);
		expect(accountInfo.owner).toStrictEqual(SystemProgram.programId);
	} 
	// If the accountInfo is null, then the account does not exist
};

const expectAnchorError = async (txResult: Promise<string>, errCode: string) => {
	let reverted = false;
	try {
		await txResult;
	} catch (e) {
		expect(e instanceof AnchorError).toBe(true);
        const err: AnchorError = e;
        expect(err.error.errorCode.code).toStrictEqual(errCode);

		reverted = true;
	} finally {
		expect(reverted).toBe(true);
	}
};

const expectSystemProgramError = async (txResult: Promise<string>) => {
	let reverted = false;
	try {
		await txResult;
	} catch (e) {
		// error is a system program error
		// we cannot validate all the info like an Anchor error
		reverted = true;
	} finally {
		expect(reverted).toBe(true);
	}
};

const expectRegisterState = async (register: PublicKey, value: number[]) => {
	const registerState = await registrar.account.register.fetch(register);

	expect(registerState.value.length).toBe(32);
	expect(registerState.value).toEqual(value); 
};

const expectFlagState = async (flag: PublicKey, value: boolean) => {
	const flagState = await registrar.account.flag.fetch(flag);

	expect(flagState.value).toBe(value);
};

const prepSetKey = (signer: Keypair, key: string, value: string) => {
	const formattedKey = toFixedSizedArray(Buffer.from(key), 32);
	const formattedValue = toFixedSizedArray(Buffer.from(value), 32);

	// Populate accounts for the instruction
	accounts.signer = signer.publicKey;

	const register = PublicKey.findProgramAddressSync(
		[Buffer.from("VALUE"), Buffer.from(formattedKey)],
		registrar.programId
	)[0];
	accounts.register = register;

	accounts.systemProgram = SystemProgram.programId;

	// Return the formatted key, value, and register
	return { key: formattedKey, value: formattedValue, register };
};

const setKey = async (key: string, value: string) => {
	// Setup the instruction call
	const { key: formattedKey, value: formattedValue, register } = prepSetKey(admin, key, value);

	// Create and send the transaction
	await registrar.methods
		.setKey(formattedKey, formattedValue)
		.accounts({ ...accounts })
		.signers([admin])
		.rpc();

	// Check that the register account has been updated with the value
	await expectRegisterState(register, formattedValue);
};

const prepDeleteKey = (signer: Keypair, key: string) => {
	const formattedKey = toFixedSizedArray(Buffer.from(key), 32);

	// Populate accounts for the instruction
	accounts.signer = signer.publicKey;

	const register = PublicKey.findProgramAddressSync(
		[Buffer.from("VALUE"), Buffer.from(formattedKey)],
		registrar.programId
	)[0];
	accounts.register = register;

	accounts.systemProgram = SystemProgram.programId;

	// Return the formatted key, value, and register
	return { key: formattedKey, register };
};

const deleteKey = async (key: string) => {
	// Setup the instruction call
	const { key: formattedKey, register } = prepDeleteKey(admin, key);

	// Create and send the transaction
	await registrar.methods
		.deleteKey(formattedKey)
		.accounts({ ...accounts })
		.signers([admin])
		.rpc();

	// Check that the register account has been updated with the value
	expectAccountEmpty(register);
};

const prepAddToList = (signer: Keypair, list: string, address: PublicKey) => {
	const formattedList = toFixedSizedArray(Buffer.from(list), 32);

	// Populate accounts for the instruction
	accounts.signer = signer.publicKey;

	const flag = PublicKey.findProgramAddressSync(
		[Buffer.from("LIST"), Buffer.from(formattedList), address.toBuffer()],
		registrar.programId
	)[0];
	accounts.flag = flag;

	accounts.systemProgram = SystemProgram.programId;

	// Return the formatted list and flag
	return { list: formattedList, flag };
};

const addToList = async (list: string, address: PublicKey) => {
	// Setup the instruction call
	const { list: formattedList, flag } = prepAddToList(admin, list, address);

	// Create and send the transaction
	await registrar.methods
		.addToList(formattedList, address)
		.accounts({ ...accounts })
		.signers([admin])
		.rpc();

	// Check that the flag account has been updated with the value
	await expectFlagState(flag, true);
};

const prepRemoveFromList = (signer: Keypair, list: string, address: PublicKey) => {
	const formattedList = toFixedSizedArray(Buffer.from(list), 32);

	// Populate accounts for the instruction
	accounts.signer = signer.publicKey;

	const flag = PublicKey.findProgramAddressSync(
		[Buffer.from("LIST"), Buffer.from(formattedList), address.toBuffer()],
		registrar.programId
	)[0];
	accounts.flag = flag;

	accounts.systemProgram = SystemProgram.programId;

	// Return the formatted list and flag
	return { list: formattedList, flag };
};

const removeFromList = async (list: string, address: PublicKey) => {
	// Setup the instruction call
	const { list: formattedList, flag } = prepRemoveFromList(admin, list, address);

	// Create and send the transaction
	await registrar.methods
		.removeFromList(formattedList, address)
		.accounts({ ...accounts })
		.signers([admin])
		.rpc();

	// Check that the flag account no longer exists
	expectAccountEmpty(flag);
};

describe("Registrar unit tests", () => {
	beforeEach(async () => {
		// Initialize the SVM instance from the workspace programs
		svm = fromWorkspace("");

		// Create an anchor provider from the liteSVM instance
		provider = new LiteSVMProvider(svm);

		// Create registrar anchor program instance
		registrar = new Program<Registrar>(REGISTRAR_IDL, provider);

		// Funds the two wallets
		svm.airdrop(admin.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
		svm.airdrop(nonAdmin.publicKey, BigInt(10 * LAMPORTS_PER_SOL));

		// clear the accounts object
		accounts = {};
	});

	// set_key

	describe("set_key unit tests", () => {

		// given the key register does not exist yet
		// given the admin signs the transaction
		// the key register is created and the value is set to the new value
		test("Admin can set a new key", async () => {
			// Setup the instruction call
			const { key, value, register } = prepSetKey(admin, "test-key", "test-value");

			// Check that the register account has not been created
			expectAccountEmpty(register);

			// Create our transaction
			await registrar.methods
				.setKey(key, value)
				.accounts({ ...accounts })
				.signers([admin])
				.rpc();

			// Check that the register account has been initialized with the value
			await expectRegisterState(register, value);
		});

		// given the key register does not exist yet
		// given the admin does not sign the transaction
		// the transaction reverts with an address constraint error on the signer account
		test("Non-admin cannot set a new key", async () => {
			// Setup the instruction call
			const { key, value, register } = prepSetKey(nonAdmin, "test-key", "test-value");

			// Check that the register account has not been created
			expectAccountEmpty(register);

			// Create and send our transaction
			// We expect an error, so we catch it
			await expectAnchorError(
				registrar.methods
					.setKey(key, value)
					.accounts({ ...accounts })
					.signers([nonAdmin])
					.rpc(),
				"ConstraintAddress"
			);
		});


		// given the key register already exists
		// given the admin signs the transaction
		// the value is set to the new value
		test("Admin can update an existing key", async () => {
			// Set the key for the first time
			await setKey("test-key", "test-value");

			// Setup the instruction call
			const { key, value: newValue, register } = prepSetKey(admin, "test-key", "new-test-value");

			// Create and send our transaction
			await registrar.methods
				.setKey(key, newValue)
				.accounts({ ...accounts })
				.signers([admin])
				.rpc();

			// Check that the register account has been updated with the new value
			expectRegisterState(register, newValue);
		});

		// given the key register already exists
		// given the admin does not sign the transaction
		// the transaction reverts with an address constraint error on the signer account
		test("Non-admin cannot update an existing key", async () => {
			// Set the key for the first time
			await setKey("test-key", "test-value");

			// Setup the instruction call
			const { key, value: newValue, register } = prepSetKey(nonAdmin, "test-key", "new-test-value");

			// Create and send our transaction
			// We expect an error, so we catch it
			await expectAnchorError(
				registrar.methods
					.setKey(key, newValue)
					.accounts({ ...accounts })
					.signers([nonAdmin])
					.rpc(),
				"ConstraintAddress"
			);

			// Check that the register account has not been updated
			await expectRegisterState(register, toFixedSizedArray(Buffer.from("test-value"), 32));
		});

		// given a key has been set and deleted
		// given the admin signs the transaction
		// the key register is created and the value is set to the new value
		test("Admin can set a key again after it is deleted", async () => {
			// Set the key for the first time
			await setKey("test-key", "test-value");

			// Delete the key
			await deleteKey("test-key");

			// Setup the instruction call
			const { key, value, register } = prepSetKey(admin, "test-key", "new-test-value");

			// Create and send our transaction
			await registrar.methods
				.setKey(key, value)
				.accounts({ ...accounts })
				.signers([admin])
				.rpc();

			// Check that the register account has been initialized with the value
			await expectRegisterState(register, value);

		});
	});

	describe("delete_key unit tests", () => {
		// given the key register does not exist yet
		// given the admin signs the transaction
		// the transaction reverts with an account does not exist error
		test("Admin cannot delete a non-existing key", async () => {
			// Setup the instruction call
			const { key, register } = prepDeleteKey(admin, "test-key");

			// Check that the register account has not been created
			expectAccountEmpty(register);

			// Create and send our transaction
			// We expect an error, so we catch it
			await expectAnchorError(
				registrar.methods
					.deleteKey(key)
					.accounts({ ...accounts })
					.signers([admin])
					.rpc(),
				"AccountNotInitialized"
			);
		});

		// given the key register does not exist yet
		// given the admin does not sign the transaction
		// the transaction reverts with an account not initialized error
		test("Non-admin cannot delete a non-existing key", async () => {
			// Setup the instruction call
			const { key, register } = prepDeleteKey(nonAdmin, "test-key");

			// Check that the register account has not been created
			expectAccountEmpty(register);

			// Create and send our transaction
			// We expect an error, so we catch it
			await expectAnchorError(
				registrar.methods
					.deleteKey(key)
					.accounts({ ...accounts })
					.signers([nonAdmin])
					.rpc(),
				"AccountNotInitialized"
			);
		});

		// given the key register already exists
		// given the admin signs the transaction
		// the key register account is closed
		test("Admin can delete an existing key", async () => {
			// Set the key for the first time
			await setKey("test-key", "test-value");

			// Setup the instruction call
			const { key, register } = prepDeleteKey(admin, "test-key");

			// Create and send our transaction
			await registrar.methods
				.deleteKey(key)
				.accounts({ ...accounts })
				.signers([admin])
				.rpc();

			// Check that the register account has been deleted
			expectAccountEmpty(register);
		});

		// given the key register already exists
		// given the admin does not sign the transaction
		// the transaction reverts with an address constraint error on the signer account
		test("Non-admin cannot delete an existing key", async () => {
			// Set the key for the first time
			await setKey("test-key", "test-value");
			
			// Setup the instruction call
			const { key, register } = prepDeleteKey(nonAdmin, "test-key");

			// Create and send our transaction
			// We expect an error, so we catch it
			await expectAnchorError(
				registrar.methods
					.deleteKey(key)
					.accounts({ ...accounts })
					.signers([nonAdmin])
					.rpc(),
				"ConstraintAddress"
			);

			// Check that the register account has not been deleted
			await expectRegisterState(register, toFixedSizedArray(Buffer.from("test-value"), 32));
		});
	});
	
	// add_to_list
	describe("add_to_list unit tests", () => {

		// given the flag account does not exist yet
		// given the admin signs the transaction
		// the flag account is created and the value set to true
		test("Admin can add an address to a list", async () => {
			// Setup the instruction call
			const address = PublicKey.unique();
			const { list, flag } = prepAddToList(admin, "test-list", address);

			// Check that the flag account has not been created
			expectAccountEmpty(flag);

			// Create and send our transaction
			await registrar.methods
				.addToList(list, address)
				.accounts({ ...accounts })
				.signers([admin])
				.rpc();

			// Check that the flag account has been initialized with the value
			await expectFlagState(flag, true);
		});

		// given the flag account does not exist yet
		// given the admin does not sign the transaction
		// the transaction reverts with an address constraint error on the signer account
		test("Non-admin cannot add an address to a list", async () => {
			// Setup the instruction call
			const address = PublicKey.unique();
			const { list, flag } = prepAddToList(nonAdmin, "test-list", address);

			// Check that the flag account has not been created
			expectAccountEmpty(flag);

			// Create and send our transaction
			// We expect an error, so we catch it
			await expectAnchorError(
				registrar.methods
					.addToList(list, address)
					.accounts({ ...accounts })
					.signers([nonAdmin])
					.rpc(),
				"ConstraintAddress"
			);
		});

		// given the flag account already exists
		// given the admin signs the transaction
		// the transaction reverts with an account already exists error
		test("Admin cannot add an address to a list that already exists", async () => {
			// Add an address to the list			
			const address = PublicKey.unique();
			await addToList("test-list", address);
			
			// Setup the instruction call
			const { list, flag } = prepAddToList(admin, "test-list", address);

			// Check that the flag account has been created
			await expectFlagState(flag, true);

			// Create and send our transaction
			// We expect an error, so we catch it
			await expectSystemProgramError(
				registrar.methods
					.addToList(list, address)
					.accounts({ ...accounts })
					.signers([admin])
					.rpc()
			);
		});

		// given a flag account already exists
		// given the admin does not sign the transaction
		// the transaction reverts with an account already exists error
		test("Non-admin cannot add an address to a list that already exists", async () => {
			// Add an address to the list			
			const address = PublicKey.unique();
			await addToList("test-list", address);
			
			// Setup the instruction call
			const { list, flag } = prepAddToList(nonAdmin, "test-list", address);

			// Check that the flag account has been created
			await expectFlagState(flag, true);

			// Create and send our transaction
			// We expect an error, so we catch it
			await expectSystemProgramError(
				registrar.methods
					.addToList(list, address)
					.accounts({ ...accounts })
					.signers([nonAdmin])
					.rpc()
			);
		});

		// given a flag account was initialized and then closed
		// given the admin signs the transaction
		// the flag account is created and the value set to true
		test("Admin can add an address to a list after it has been removed", async () => {
			// Add an address to the list
			const address = PublicKey.unique();
			await addToList("test-list", address);

			// Remove the address from the list
			await removeFromList("test-list", address);

			// Setup the instruction call
			const { list, flag } = prepAddToList(admin, "test-list", address);

			// Wait 1 second
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// Warp forward in time to ensure the account state is correct
			let clock = svm.getClock();
			clock.unixTimestamp = clock.unixTimestamp + 3600n;
			svm.setClock(clock);

			console.log("accounts: ", accounts);

			// Create and send our transaction
			try {
				await registrar.methods
				.addToList(list, address)
				.accounts({ ...accounts })
				.signers([admin])
				.rpc();
			} catch (e) {
				console.log("error: ", e);
				console.log("error logs", await e.getLogs());

			}
			
			// Check that the flag account has been initialized with the value
			await expectFlagState(flag, true);
		});
	});

	describe("remove_from_list unit tests", () => {
		
		// given the flag account does not exist yet
		// given the admin signs the transaction
		// the transaction reverts with an account does not exist error
		test("Admin cannot remove an address from a non-existing list", async () => {
			// Setup the instruction call
			const address = PublicKey.unique();
			const { list, flag } = prepRemoveFromList(admin, "test-list", address);

			// Check that the flag account has not been created
			expectAccountEmpty(flag);

			// Create and send our transaction
			// We expect an error, so we catch it
			await expectAnchorError(
				registrar.methods
					.removeFromList(list, address)
					.accounts({ ...accounts })
					.signers([admin])
					.rpc(),
				"AccountNotInitialized"
			);
		});

		// given the flag account does not exist yet
		// given the admin does not sign the transaction
		// the transaction reverts with an account not initialized error
		test("Non-admin cannot remove an address from a non-existing list", async () => {
			// Setup the instruction call
			const address = PublicKey.unique();
			const { list, flag } = prepRemoveFromList(nonAdmin, "test-list", address);

			// Check that the flag account has not been created
			expectAccountEmpty(flag);

			// Create and send our transaction
			// We expect an error, so we catch it
			await expectAnchorError(
				registrar.methods
					.removeFromList(list, address)
					.accounts({ ...accounts })
					.signers([nonAdmin])
					.rpc(),
				"AccountNotInitialized"
			);
		});

		// given the flag account already exists
		// given the admin signs the transaction
		// the flag account is closed
		test("Admin can remove an address from a list", async () => {
			// Add an address to the list			
			const address = PublicKey.unique();
			await addToList("test-list", address);

			// Setup the instruction call
			const { list, flag } = prepRemoveFromList(admin, "test-list", address);

			// Check that the flag account has been created
			await expectFlagState(flag, true);

			// Create and send our transaction
			await registrar.methods
				.removeFromList(list, address)
				.accounts({ ...accounts })
				.signers([admin])
				.rpc();

			// Check that the flag account has been deleted
			expectAccountEmpty(flag);
		});

		// given the flag account already exists
		// given the admin does not sign the transaction
		// the transaction reverts with an address constraint error on the signer account
		test("Non-admin cannot remove an address from a list", async () => {
			// Add an address to the list			
			const address = PublicKey.unique();
			await addToList("test-list", address);

			// Setup the instruction call
			const { list, flag } = prepRemoveFromList(nonAdmin, "test-list", address);

			// Check that the flag account has been created
			await expectFlagState(flag, true);

			// Create and send our transaction
			// We expect an error, so we catch it
			await expectAnchorError(
				registrar.methods
					.removeFromList(list, address)
					.accounts({ ...accounts })
					.signers([nonAdmin])
					.rpc(),
				"ConstraintAddress"
			);

			// Check that the flag account has not been deleted
			await expectFlagState(flag, true);
		});
	});
});

