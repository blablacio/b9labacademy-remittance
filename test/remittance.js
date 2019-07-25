const BN = web3.utils.BN;
const Remittance = artifacts.require('./Remittance.sol');

contract('Remittance', accounts => {
  let remittance, password1Hash, password2Hash, password3Hash;
  const [owner, payer1, intermediary1, payer2, intermediary2] = accounts;

  beforeEach('setup contract for each test', async () => {
    remittance = await Remittance.new(10000, false, { from: owner});
    password1Hash = await remittance.generatePasswordHash(
      intermediary1,
      web3.utils.toHex('blablacio')
    );
    password2Hash = await remittance.generatePasswordHash(
      intermediary1,
      web3.utils.toHex('wrong')
    );
    password3Hash = await remittance.generatePasswordHash(
      intermediary2,
      web3.utils.toHex('another')
    );
  });

  it('should enable only owner to change commission', async() => {
    let commission = await remittance.commission();

    assert.isTrue(commission.eq(new BN(10000)), 'Incorrect initial commission');

    try {
      await remittance.changeCommission(5000, { from: payer1 });
    } catch (err) {
      assert.equal(err.reason, 'Ownable: caller is not the owner');
    }
  });

  it('should not accept deposits smaller than the commission', async() => {
    try {
      await remittance.deposit(
        password1Hash,
        86400 * 10,
        { from: payer1, value: 10000 }
      );
    } catch(err) {
      assert.equal(err.reason, 'You need to at least cover the commission');
    }
  });

  it('should handle deposits properly', async() => {
    await remittance.deposit(
      password1Hash,
      86400 * 3,
      { from: payer1, value: 100000 }
    );

    let payment = await remittance.payments(password1Hash);

    assert.isTrue(
      payment.amount.eq(new BN(100000).sub(new BN(10000)))
    );
    assert.strictEqual(payment.payer, payer1);

    try {
      await remittance.deposit(
        password2Hash,
        86400 * 42,
        { from: payer1, value: 100000 }
      );
    } catch(err) {
      assert.strictEqual(err.reason, 'Expiry must be less than 30 days');
    }
  });

  it('should enable only intermediaries to claim with correct password', async() => {
    await remittance.deposit(
      password1Hash,
      86400 * 3,
      { from: payer1, value: 100000 }
    );

    try {
      await remittance.claim(
        web3.utils.toHex('blablacio'),
        { from: intermediary2 }
      );
    } catch(err) {
      assert.strictEqual(err.reason, 'Wrong credentials or deposit already claimed');
    }
    
    try {
      await remittance.claim(
        web3.utils.toHex('wrong'),
        { from: intermediary1 }
      );
    } catch(err) {
      assert.strictEqual(err.reason, 'Wrong credentials or deposit already claimed');
    }

    let intermediary1StartingBalance = new BN(await web3.eth.getBalance(intermediary1));

    let tx = await remittance.claim(
      web3.utils.toHex('blablacio'),
      { from: intermediary1, gasPrice: 42 }
    );

    let intermediary1EndingBalance = new BN(await web3.eth.getBalance(intermediary1));
    let web3Tx = await web3.eth.getTransaction(tx.tx);

    assert.isTrue(
      intermediary1StartingBalance
      .add(new BN(90000))
      .sub(new BN(tx.receipt.gasUsed).mul(new BN(web3Tx.gasPrice)))
      .eq(intermediary1EndingBalance)
    );
  });

  it('should enable only payer to get a refund after expiry', async() => {
    await remittance.deposit(
      password1Hash,
      86400 * 14,
      { from: payer1, value: 100000 }
    );

    try {
      await remittance.refund(
        password1Hash,
        { from: payer2 }
      );
    } catch(err) {
      assert.strictEqual(err.reason, 'Only payer allowed');
    }

    try {
      await remittance.refund(
        password1Hash,
        { from: payer1 }
      );
    } catch(err) {
      assert.strictEqual(err.reason, 'Deposit has not yet expired');
    }

    await remittance.deposit(
      password3Hash,
      60,
      { from: payer1, value: 100000 }
    );

    await web3.currentProvider.send(
      {
        jsonrpc: '2.0',
        method: 'evm_increaseTime',
        params: [70],
        id: 0
      },
      () => {}
    );

    let payer1StartingBalance = new BN(await web3.eth.getBalance(payer1));

    let tx = await remittance.refund(
      password3Hash,
      { from: payer1, gasPrice: 42 }
    );

    let payer1EndingBalance = new BN(await web3.eth.getBalance(payer1));
    let web3Tx = await web3.eth.getTransaction(tx.tx);

    assert.isTrue(
      payer1StartingBalance
      .add(new BN(90000))
      .sub(new BN(tx.receipt.gasUsed).mul(new BN(web3Tx.gasPrice)))
      .eq(payer1EndingBalance)
    );
  });

  it('should not allow duplicate deposits', async() => {
    await remittance.deposit(
      password1Hash,
      86400 * 14,
      { from: payer1, value: 100000 }
    );

    try {
      await remittance.deposit(
        password1Hash,
        86400 * 14,
        { from: payer1, value: 100000 }
      );
    } catch(err) {
      assert.strictEqual(err.reason, 'This password has already been used!');
    }
  });

  it('should only allow owner to pause, resume and kill', async() => {
    try {
      await remittance.pause({ from: payer1 });
    } catch(err) {
      assert.strictEqual(err.reason, 'Ownable: caller is not the owner');
    }

    assert.isFalse(await remittance.isPaused());
    await remittance.pause({ from: owner });
    assert.isTrue(await remittance.isPaused());

    try {
      await remittance.resume({ from: payer1 });
    } catch(err) {
      assert.strictEqual(err.reason, 'Ownable: caller is not the owner');
    }

    try {
      await remittance.kill({ from: payer1 });
    } catch(err) {
      assert.strictEqual(err.reason, 'Ownable: caller is not the owner');
    }

    assert.isFalse(await remittance.isKilled());
    await remittance.kill({ from: owner });
    assert.isTrue(await remittance.isKilled());
  });

  it('should not allow pausing/resuming killed contracts', async() => {
    assert.isFalse(await remittance.isKilled());

    await remittance.pause({ from: owner });
    await remittance.kill({ from: owner });
  
    assert.isTrue(await remittance.isKilled());

    try {
      await remittance.pause({ from: owner });
    } catch(err) {
      assert.strictEqual(err.reason, 'Contract killed');
    }

    try {
      await remittance.resume({ from: owner });
    } catch(err) {
      assert.strictEqual(err.reason, 'Contract killed');
    }
  });

  it('should only allow deposits when not paused', async() => {
    assert.isFalse(await remittance.isPaused());

    await remittance.pause({ from: owner });

    assert.isTrue(await remittance.isPaused());

    try {
      await remittance.deposit(
        password1Hash,
        60,
        { from: payer1, value: 100000 }
      );
    } catch(err) {
      assert.strictEqual(err.reason, 'Contract paused');
    }
  });

  it('should allow claiming even when paused', async() => {
    assert.isFalse(await remittance.isPaused());

    await remittance.deposit(
      password1Hash,
      60,
      { from: payer1, value: 100000 }
    );
    await remittance.pause({ from: owner });

    let intermediary1StartingBalance = new BN(await web3.eth.getBalance(intermediary1));

    let tx = await remittance.claim(
      web3.utils.toHex('blablacio'),
      { from: intermediary1, gasPrice: 42 }
    );

    let intermediary1EndingBalance = new BN(await web3.eth.getBalance(intermediary1));
    let web3Tx = await web3.eth.getTransaction(tx.tx);

    assert.isTrue(
      intermediary1StartingBalance
      .add(new BN(90000))
      .sub(new BN(tx.receipt.gasUsed).mul(new BN(web3Tx.gasPrice)))
      .eq(intermediary1EndingBalance)
    );
  });

  it('should not allow deposits or claims when contract is killed', async() => {
    assert.isFalse(await remittance.isKilled());

    await remittance.deposit(
      password1Hash,
      60,
      { from: payer1, value: 100000 }
    );

    let payment = await remittance.payments(password1Hash);
    assert.strictEqual(payment.payer, payer1);
    assert.isTrue(payment.amount.add(new BN(10000)).eq(new BN(100000)));

    await remittance.pause({ from: owner });
    await remittance.kill({ from: owner });

    try {
      await remittance.deposit(
        password1Hash,
        60,
        { from: payer1, value: 100000 }
      );
    } catch(err) {
      assert.strictEqual(err.reason, 'Contract killed');
    }

    try {
      await remittance.claim(
        web3.utils.toHex('blablacio'),
        { from: intermediary1 }
      );
    } catch(err) {
      assert.strictEqual(err.reason, 'Contract killed');
    }
  });

  it('should only allow killing of paused contracts', async() => {
    assert.isFalse(await remittance.isKilled());

    try {
      await remittance.kill({ from: owner });
    } catch(err) {
      assert.strictEqual(err.reason, 'Contract not paused');
    }

    assert.isFalse(await remittance.isKilled());

    await remittance.pause({ from: owner });
    await remittance.kill({ from: owner });

    assert.isTrue(await remittance.isKilled());
  });
});
