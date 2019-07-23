# B9lab Academy Remittance

Remittance is a smart contract that enables the following functionality:
- Depositing money from payers, supplying two password for payee and intermediary
- Claiming balances by intermediaries, providing the correct combination of payee and intermediary password
- Allows payers to set expiry before which funds can be claimed
- Allows payers to get a refund after expiry has been reached, provided it's before a certain deadline
- Allows owner to set commission for each transaction
- Allows owner to pause, resume or kill the contract

## Installation

You need a recent version of [Docker](https://docs.docker.com/install/) and [Docker Compose](https://docs.docker.com/compose/install/)

## Usage

```
docker-compose build
docker-compose up -d
```

You can then check tests output:
```
docker logs -f remittance-tests
```