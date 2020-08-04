fs = require('fs');
const { ApiPromise, WsProvider } = require('@polkadot/api');
const wsProvider = "wss://kusama-rpc.polkadot.io";

async function writeCSV (api, currentEraIndex, currentSessionIndex, blockNumber) {
  console.log(`Writing nominators CSV for session ${currentSessionIndex}`)
  const nominators = await api.query.staking.nominators.entries();
  const nominatorAddresses = nominators.map(([address]) => address.toHuman()[0]);
  const nominatorStaking = await Promise.all(
    nominatorAddresses.map(nominatorAddress => api.derive.staking.account(nominatorAddress))
  );
  const filePath = `/var/www/nominator-csv/kusama_nominators_session_${currentSessionIndex}.csv`;
  var file = fs.createWriteStream(filePath);
  file.on('error', function(err) { console.log(err) });
  file.write(`era;session;block_number;stash_address;controller_address;bonded_amount;num_targets;targets;\n`);
  for (let i = 0, len = nominatorStaking.length; i < len; i++) {
    const staking = nominatorStaking[i];
    const numTargets = staking.nominators ? staking.nominators.length : 0;
    const targets = JSON.stringify(staking.nominators);
    file.write(`${currentEraIndex};${currentSessionIndex};${blockNumber};${staking.accountId};${staking.controllerId};${staking.stakingLedger.total};${numTargets};${targets};\n`);
  }
  file.end();
  console.log(`Finished writing nominators CSV for session ${currentSessionIndex}`)
  return true;
}

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
      writeCSV(api, currentEraIndex, currentSessionIndex, blockNumber);
    }
  });
}

main().catch(console.error);