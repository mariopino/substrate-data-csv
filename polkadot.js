fs = require('fs');
const { ApiPromise, WsProvider } = require('@polkadot/api');
const { writeCSV } = require('./utils.js');

const network = "polkadot";
const wsProvider = "wss://polkadot.polkastats.io/rpc";
const exportDir = "/var/www/substrate-data-csv"

async function main () {
  let currentKnownSessionIndex = 0;
  const provider = new WsProvider(wsProvider);
  const api = await ApiPromise.create({ provider });
  await api.rpc.chain.subscribeNewHeads(async (header) => {
    const blockNumber = header.number.toNumber();
    const sessionInfo = await api.derive.session.info();
    const currentSessionIndex = sessionInfo.currentIndex.toNumber();
    const currentEraIndex = sessionInfo.activeEra.toNumber();
    if (currentSessionIndex > currentKnownSessionIndex) {
      currentKnownSessionIndex = currentSessionIndex;
      writeCSV(api, network, exportDir, currentEraIndex, currentSessionIndex, blockNumber);
    }
  });
}

main().catch(console.error);