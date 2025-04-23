import { useState } from 'react';
import { NETWORK } from '../services/rpc';
import { Message } from '@solana/web3.js';

export const Simulate = () => {
  const [typedMessage, setTypedMessage] = useState('');
  const [linkToTxn, setLinkToTxn] = useState('');

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;

    if (value === '') {
      setLinkToTxn('');
    }

    // allow json format
    if (/^[\s\S]*$/.test(value)) {
      setTypedMessage(value);
    }

    // convert the typed message into a serialized solana transaction
    try {
      const parsedMessage = JSON.parse(value);
      const message = new Message(parsedMessage.message);

      const serializedMessage = message.serialize().toString('base64');

      // escape the serialized string for the URL
      const escapedSerialized = encodeURIComponent(serializedMessage);

      setLinkToTxn(
        `https://solana.fm/inspector?message=${escapedSerialized}&signatures=%255B%25221111111111111111111111111111111111111111111111111111111111111111%2522%255D` +
          NETWORK ===
          'devnet'
          ? '&cluster=devnet-alpha'
          : '',
      );
    } catch (error) {
      console.error('Error parsing transaction:', error);
      setLinkToTxn('');
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
        <a href={linkToTxn} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
          <button
            disabled={linkToTxn === ''}
            className={'text-white py-2 px-4 rounded mt-4' + (linkToTxn === '' ? ' bg-white-500' : ' bg-blue-500')}
          >
            <h2 className="text-lg font-semibold">Link to Simulate</h2>
          </button>
        </a>
      </div>
    </div>
  );
};
