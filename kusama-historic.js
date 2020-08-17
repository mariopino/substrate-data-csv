fs = require('fs');
const { ApiPromise, WsProvider } = require('@polkadot/api');
const { writeCSV } = require('./utils.js');

const network = "kusama";
const wsProvider = "wss://kusama-rpc.polkadot.io";
const exportDir = "/var/www/substrate-data-csv"

async function main () {
  const provider = new WsProvider(wsProvider);
  const api = await ApiPromise.create({ provider });

  let activeEra = await api.query.staking.activeEra();
  activeEra = JSON.parse(JSON.stringify(activeEra));
  const currentEraIndex = activeEra.index;
  const historyDepth = await api.query.staking.historyDepth();

  for (let eraIndex = currentEraIndex - 1; eraIndex >= currentEraIndex - historyDepth && eraIndex > 0; eraIndex--) {
    await writeEraCSV(api, network, exportDir, eraIndex);
  }

}

main().catch(console.error);