# substrate-data-csv

This script:

- Subscribes to new blocks
- Fetch validator and nominator data on every session change (first block of the session, except for the first execution)
- Write CSV files


Install:

Nodejs is required.

```
git clone https://github.com/mariopino/substrate-data-csv.git
cd substrate-data-csv
npm install
mkdir /var/www/substrate-data-csv
```

Run for Polkadot:

```
node polkadot.js
```

Run for Kusama:

```
node kusama.js
```
