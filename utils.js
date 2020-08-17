const { isHex } = require("@polkadot/util");
const BN = require("bn.js");

module.exports = {
  writeCSV: async function (api, network, exportDir, currentEraIndex, currentSessionIndex, blockNumber) {

    // Write nominators CSV
    console.log(`Writing nominators CSV for session ${currentSessionIndex}`)
    const nominators = await api.query.staking.nominators.entries();
    const nominatorAddresses = nominators.map(([address]) => address.toHuman()[0]);
    const nominatorStaking = await Promise.all(
      nominatorAddresses.map(nominatorAddress => api.derive.staking.account(nominatorAddress))
    );
    let filePath = `${exportDir}/${network}_nominators_session_${currentSessionIndex}.csv`;
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
      // add identity
      const { identity } = await api.derive.accounts.info(validator.accountId);
      validator.identity = identity;
      validator.displayName = module.exports.getDisplayName(identity);
      // add voters
      let voters = 0;
      for (let i = 0, len = nominatorStaking.length; i < len; i++) {
        const staking = nominatorStaking[i];
        if (staking.nominators.includes(validator.accountId)) {
          voters++
        }
      }
      validator.voters = voters;
    }

    filePath = `${exportDir}/${network}_validators_session_${currentSessionIndex}.csv`;
    file = fs.createWriteStream(filePath);
    file.on('error', function(err) { console.log(err) });
    file.write(`era,session,block_number,name,stash_address,controller_address,commission_percent,self_stake,total_stake,num_stakers,voters\n`);
    for (let i = 0, len = validatorStaking.length; i < len; i++) {
      const staking = validatorStaking[i];
      file.write(`${currentEraIndex},${currentSessionIndex},${blockNumber},${staking.displayName},${staking.accountId},${staking.controllerId},${(parseInt(staking.validatorPrefs.commission) / 10000000).toFixed(2)},${staking.exposure.own},${staking.exposure.total},${staking.exposure.others.length},${staking.voters}\n`);
    }
    file.end();
    console.log(`Finished writing validators CSV for session ${currentSessionIndex}`);

    return true;
  },
  writeEraCSV: async function (api, network, exportDir, eraIndex) {

    //
    // Validators CSV
    //

    // Get era validator exposures
    const exposures = await api.query.staking.erasStakers.entries(eraIndex);
    const eraExposures = exposures.map(([key, exposure]) => {
      return {
        accountId: key.args[1].toHuman(),
        exposure: JSON.parse(JSON.stringify(exposure))
      }
    });

    // Get era validator addresses
    const endEraValidatorList = eraExposures.map(exposure => {
      return exposure.accountId;
    });

    // Get validator commission for the era (in same order as endEraValidatorList)
    const eraValidatorCommission = await Promise.all(
      endEraValidatorList.map(accountId => api.query.staking.erasValidatorPrefs(eraIndex, accountId))
    );

    // Write validators CSV
    console.log(`Writing validators CSV for era ${eraIndex}`);

    let filePath = `${exportDir}/${network}_validators_era_${eraIndex}.csv`;
    let file = fs.createWriteStream(filePath);
    file.on('error', function(err) { console.log(err) });
    file.write(`era,name,stash_address,commission_percent,self_stake,total_stake,stakers,num_stakers\n`);

    for (let i = 0; i < endEraValidatorList.length; i++) {
      const validator = endEraValidatorList[i];
      const { identity } = await api.derive.accounts.info(validator);
      const displayName = module.exports.getDisplayName(identity);
      const commission = (parseInt(eraValidatorCommission[i].commission) / 10000000).toFixed(2);
      const exposure = eraExposures.find( exposure => exposure.accountId === validator).exposure;
      file.write(`${eraIndex},${displayName},${validator},${commission},${exposure.own},${exposure.total},${exposure.others.map(({ who }) => who).join(',')},${exposure.others.length}\n`);
      
    }
    file.end();
    console.log(`Finished writing validators CSV for era ${eraIndex}`);
    
    //
    // Nominators CSV
    //

    console.log(`Writing nominators CSV for era ${eraIndex}`)
    let nominatorStaking = [];
    for (let i = 0; i < endEraValidatorList.length; i++) {
      const validator = endEraValidatorList[i];
      const exposure = eraExposures.find( exposure => exposure.accountId === validator).exposure;
      if (exposure.others.length > 0) {
        for (let j = 0; j < exposure.others.length; j++) {
          let nominator = exposure.others[j];
          if (nominatorStaking.find(nom => nom.accountId === nominator.who)) {
            let nominatorTmp = nominatorStaking.filter(nom => {
              return nom.accountId === nominator.who;
            });
            let bn;
            if (isHex(nominator.value)) {
              bn = new BN(
                nominator.value.substring(2, nominator.value.length),
                16
              );
            } else {
              bn = new BN(nominator.value.toString(), 10);
            }
            nominatorTmp[0].totalStaked = nominatorTmp[0].totalStaked.add(bn);
            nominatorTmp[0].nominations++;
            nominatorTmp[0].staking.push({
              validator: validator,
              amount: nominator.value
            });
          } else {
            let bn;
            if (isHex(nominator.value)) {
              bn = new BN(
                nominator.value.substring(2, nominator.value.length),
                16
              );
            } else {
              bn = new BN(nominator.value.toString(), 10);
            }
            const { identity } = await api.derive.accounts.info(nominator.who);
            const displayName = module.exports.getDisplayName(identity);

            nominatorStaking.push({
              accountId: nominator.who,
              name: displayName,
              totalStaked: bn,
              nominations: 1,
              staking: [
                {
                  validator: validator,
                  amount: nominator.value
                }
              ],
            });
          }
        }
      }
    }

    filePath = `${exportDir}/${network}_nominators_era_${eraIndex}.csv`;
    file = fs.createWriteStream(filePath);
    file.on('error', function(err) { console.log(err) });
    file.write(`era,name,stash_address,bonded_amount,num_targets,targets\n`);
    nominatorStaking.forEach(nominator => {
      file.write(`${eraIndex},${nominator.name},${nominator.accountId},${nominator.totalStaked},${nominator.nominations},"${nominator.staking.map(({ validator }) => validator).join(`,`)}"\n`);
    });
    file.end();
    console.log(`Finished writing nominators CSV for era ${eraIndex}`);

    return;
  },
  getDisplayName: function (identity) {
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
}