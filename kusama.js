fs = require('fs');
const { ApiPromise, WsProvider } = require('@polkadot/api');

const network = "kusama";
const wsProvider = "wss://kusama-rpc.polkadot.io";

async function writeCSV (api, currentEraIndex, currentSessionIndex, blockNumber) {

  // Write nominators CSV
  console.log(`Writing nominators CSV for session ${currentSessionIndex}`)
  const nominators = await api.query.staking.nominators.entries();
  const nominatorAddresses = nominators.map(([address]) => address.toHuman()[0]);
  const nominatorStaking = await Promise.all(
    nominatorAddresses.map(nominatorAddress => api.derive.staking.account(nominatorAddress))
  );
  let filePath = `/var/www/nominator-csv/${network}_nominators_session_${currentSessionIndex}.csv`;
  let file = fs.createWriteStream(filePath);
  file.on('error', function(err) { console.log(err) });
  file.write(`era,session,block_number,stash_address,controller_address,bonded_amount,num_targets,targets\n`);
  for (let i = 0, len = nominatorStaking.length; i < len; i++) {
    const staking = nominatorStaking[i];
    const numTargets = staking.nominators ? staking.nominators.length : 0;
    const targets = JSON.stringify(staking.nominators);
    file.write(`${currentEraIndex},${currentSessionIndex},${blockNumber},${staking.accountId},${staking.controllerId},${staking.stakingLedger.total},${numTargets},"${staking.nominators.join(`,`)}"\n`);
  }
  file.end();
  console.log(`Finished writing nominators CSV for session ${currentSessionIndex}`);

  // Write validators CSV
  console.log(`Writing validators CSV for session ${currentSessionIndex}`)
  const validatorAddresses = await api.query.session.validators();
  const validatorStaking = await Promise.all(
    validatorAddresses.map(authorityId => api.derive.staking.account(authorityId))
  );
  for(let i = 0; i < validatorStaking.length; i++) {
    let validator = validatorStaking[i];
    const { identity } = await api.derive.accounts.info(validator.accountId);
    validator.identity = identity;
    validator.displayName = getDisplayName(identity);
  }

  filePath = `/var/www/nominator-csv/${network}_validators_session_${currentSessionIndex}.csv`;
  file = fs.createWriteStream(filePath);
  file.on('error', function(err) { console.log(err) });
  file.write(`era,session,block_number,name,stash_address,controller_address,commission_percent,self_stake,total_stake,num_stakers\n`);
  for (let i = 0, len = validatorStaking.length; i < len; i++) {
    const staking = validatorStaking[i];
    file.write(`${currentEraIndex},${currentSessionIndex},${blockNumber},${staking.displayName},${staking.accountId},${staking.controllerId},${(parseInt(staking.validatorPrefs.commission) / 10000000).toFixed(2)},${staking.exposure.own},${staking.exposure.total},${staking.exposure.others.length}\n`);
  }
  file.end();
  console.log(`Finished writing validators CSV for session ${currentSessionIndex}`);

  return true;
}

function getDisplayName(identity) {
  if (
    identity.displayParent &&
    identity.displayParent !== `` &&
    identity.display &&
    identity.display !== ``
  ) {
    return `${identity.displayParent.replace(/\n/g, '')} / ${identity.display.replace(/\n/g, '')}`;
  } else {
    return identity.display || ``;
  }
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