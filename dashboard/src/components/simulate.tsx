import { useState } from 'react';
import { NETWORK } from '../services/rpc';
import { Message, MessageV0 } from '@solana/web3.js';

export const Simulate = () => {
  const [typedMessage, setTypedMessage] = useState('');
  const [linkToTxn, setLinkToTxn] = useState('');
  const [parseError, setParseError] = useState(false);

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;

    if (value === '') {
      setLinkToTxn('');
      setParseError(false);
    }

    setTypedMessage(value);

    // allow json format
    if (!/^[\s\S]*$/.test(value)) {
      setParseError(true);
      return;
    }

    // convert the typed message into a serialized solana transaction
    try {
      const parsedMessage = JSON.parse(value);

      if (!parsedMessage.message) {
        throw new Error('Invalid message format');
      }

      console.log('Parsed message:', parsedMessage.message);

      let serializedMessage;
      if (parsedMessage.message.staticAccountKeys) {
        console.log('made it here');
        const message = new MessageV0(parsedMessage.message);
        // Probably something like this: message.resolveAddressTableLookups();
        serializedMessage = Buffer.from(message.serialize()).toString('base64');
        console.log('Serialized message:', serializedMessage);
      } else if (parsedMessage.message.accountKeys) {
        const message = new Message(parsedMessage.message);
        serializedMessage = message.serialize().toString('base64');
      } else {
        throw new Error('Invalid message format');
      }

      // escape the serialized string for the URL
      const escapedSerialized = encodeURIComponent(serializedMessage);

      let url = `https://solana.fm/inspector?message=${escapedSerialized}&signatures=%255B%25221111111111111111111111111111111111111111111111111111111111111111%2522%255D`;
      if (NETWORK === 'devnet') {
        url += '&cluster=devnet-alpha';
      }

      setLinkToTxn(url);
      setParseError(false);
    } catch (error) {
      console.error('Error parsing transaction:', error);
      setLinkToTxn('');
      setParseError(true);
      return;
    }
  };

  return (
    <div className="flex justify-center mt-20">
      <div className="p-10 w-full max-w-xxl">
        <h2 className="text-lg font-semibold">Raw Message Data</h2>
        <textarea
          value={typedMessage}
          onChange={handleMessageChange}
          placeholder=""
          rows={10}
          className="w-full bg-off-blue py-3 px-4 pr-20 focus:outline-none"
        />
        {parseError ? (
          <h2 className="text-lg font-semibold font-red-500">Invalid Input</h2>
        ) : (
          <a href={linkToTxn} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
            <button
              disabled={linkToTxn === ''}
              className={'text-white py-2 px-4 rounded mt-4' + (linkToTxn === '' ? ' bg-white-500' : ' bg-blue-500')}
              // className="text-white py-2 px-4 rounded mt-4 bg-blue-500"
            >
              <h2 className="text-lg font-semibold">Link to Simulate</h2>
            </button>
          </a>
        )}
      </div>
    </div>
  );
};
