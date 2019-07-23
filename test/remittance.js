const BN = web3.utils.BN;
const Remittance = artifacts.require('./Remittance.sol');

contract('Remittance', accounts => {
  let remittance;
  const [owner, payer1, intermediary1, payer2, intermediary2] = accounts;
  const statuses = { Pending: new BN(0), Claimed: new BN(1), Refunded: new BN(2) };

  beforeEach('setup contract for each test', async () => {
    remittance = await Remittance.new(86400 * 14, 10000, false, { from: owner});
  });

  it('should enable only owner to change deadline delta', async() => {
    let deadlineDelta = await remittance.deadlineDelta();

    assert.isTrue(
      deadlineDelta.eq(new BN(86400).mul(new BN(14))),
      'Incorrect initial deadline delta'
    );

    try {
      await remittance.changeDeadlineDelta(86400 * 7, { from: payer1 });
    } catch (err) {
      assert.equal(err.reason, 'Ownable: caller is not the owner');
    }
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
        intermediary1,
        '0xea1c426e4e705c5bd7883fa29ddd4579226a7627993ac2f85c7afa1df1a39d8c',
        '0xc9bcf7287deeb04d4f3ac502fed09ccb2ee69988023843c52f7f59e69d6f9696',
        86400 * 10,
        { from: payer1, value: 10000 }
      );
    } catch(err) {
      assert.equal(err.reason, 'You need to at least cover the commission');
    }
  });

  it('should handle deposits properly', async() => {
    let paymentHash = await remittance.deposit.call(
      intermediary1,
      '0xea1c426e4e705c5bd7883fa29ddd4579226a7627993ac2f85c7afa1df1a39d8c',
      '0xc9bcf7287deeb04d4f3ac502fed09ccb2ee69988023843c52f7f59e69d6f9696',
      86400 * 3,
      { from: payer1, value: 100000 }
    );

    await remittance.deposit(
      intermediary1,
      '0xea1c426e4e705c5bd7883fa29ddd4579226a7627993ac2f85c7afa1df1a39d8c',
      '0xc9bcf7287deeb04d4f3ac502fed09ccb2ee69988023843c52f7f59e69d6f9696',
      86400 * 3,
      { from: payer1, value: 100000 }
    );

    let payment = await remittance.payments(paymentHash);

    assert.strictEqual(
      payment.payeePassword,
      '0xea1c426e4e705c5bd7883fa29ddd4579226a7627993ac2f85c7afa1df1a39d8c',
      'Wrong payee password'
    );
    assert.strictEqual(
      payment.intermediaryPassword,
      '0xc9bcf7287deeb04d4f3ac502fed09ccb2ee69988023843c52f7f59e69d6f9696',
      'Wrong intermediary password'
    );
    assert.isTrue(
      payment.amount.eq(new BN(100000).sub(new BN(10000))),
      'Wrong amount'
    );
    assert.isTrue(payment.status.eq(statuses.Pending), 'Wrong initial status');
    assert.strictEqual(payment.payer, payer1, 'Wrong payer');
    assert.strictEqual(payment.intermediary, intermediary1, 'Wrong initial intermediary');
    assert.isTrue(payment.expires.eq(new BN(86400).mul(new BN(3))), 'Wrong expiry');
  });

  it('should only enable payer to change passwords', async() => {
    let paymentHash = await remittance.deposit.call(
      intermediary1,
      '0xae3230e7df366e086e69d35dc2a1b614fb48339756a72741c39654a78c4c9489',
      '0x892a5c2516d3e850745f5788a81c679facc50c002f9326881f37106b02d85a61',
      86400 * 3,
      { from: payer1, value: 100000 }
    );

    await remittance.deposit(
      intermediary1,
      '0xae3230e7df366e086e69d35dc2a1b614fb48339756a72741c39654a78c4c9489',
      '0x892a5c2516d3e850745f5788a81c679facc50c002f9326881f37106b02d85a61',
      86400 * 3,
      { from: payer1, value: 100000 }
    );

    try {
      await remittance.changePayeePassword(
        paymentHash,
        '0xb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cf6',
        { from: payer2 }
      );
    } catch(err) {
      assert.strictEqual(err.reason, 'Only payer allowed');
    }

    let payment = await remittance.payments(paymentHash);

    assert.strictEqual(
      payment.payeePassword,
      '0xae3230e7df366e086e69d35dc2a1b614fb48339756a72741c39654a78c4c9489'
    );

    try {
      await remittance.changeIntermediaryPassword(
        paymentHash,
        '0xb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cf6',
        { from: payer2 }
      );
    } catch(err) {
      assert.strictEqual(err.reason, 'Only payer allowed');
    }

    payment = await remittance.payments(paymentHash);
    assert.strictEqual(
      payment.intermediaryPassword,
      '0x892a5c2516d3e850745f5788a81c679facc50c002f9326881f37106b02d85a61'
    );
  });

  it('should enable only intermediaries to claim with proper passwords', async() => {
    let paymentHash = await remittance.deposit.call(
      intermediary1,
      '0xae3230e7df366e086e69d35dc2a1b614fb48339756a72741c39654a78c4c9489',
      '0x892a5c2516d3e850745f5788a81c679facc50c002f9326881f37106b02d85a61',
      86400 * 3,
      { from: payer1, value: 100000 }
    );

    let deposit = await remittance.deposit(
      intermediary1,
      '0xae3230e7df366e086e69d35dc2a1b614fb48339756a72741c39654a78c4c9489',
      '0x892a5c2516d3e850745f5788a81c679facc50c002f9326881f37106b02d85a61',
      86400 * 3,
      { from: payer1, value: 100000 }
    );

    try {
      await remittance.claim(
        paymentHash,
        web3.utils.padRight(web3.utils.toHex('blablacio'), 64),
        web3.utils.padRight(web3.utils.toHex('oicalbalb')),
        { from: intermediary2 }
      );
    } catch(err) {
      assert.strictEqual(err.reason, 'Only intermediary allowed');
    }
    
    try {
      await remittance.claim(
        paymentHash,
        web3.utils.padRight(web3.utils.toHex('wrong'), 64),
        web3.utils.padRight(web3.utils.toHex('oicalbalb'), 64),
        { from: intermediary1 }
      );
    } catch(err) {
      assert.strictEqual(err.reason, 'Payee password does not match!');
    }

    try {
      await remittance.claim(
        paymentHash,
        web3.utils.padRight(web3.utils.toHex('blablacio'), 64),
        web3.utils.padRight(web3.utils.toHex('wrong'), 64),
        { from: intermediary1 }
      );
    } catch(err) {
      assert.strictEqual(err.reason, 'Intermediary password does not match!');
    }

    let intermediary1StartingBalance = new BN(await web3.eth.getBalance(intermediary1));

    let tx = await remittance.claim(
      paymentHash,
      web3.utils.padRight(web3.utils.toHex('blablacio'), 64),
      web3.utils.padRight(web3.utils.toHex('oicalbalb'), 64),
      { from: intermediary1, gasPrice: 42 }
    );

    let intermediary1EndingBalance = new BN(await web3.eth.getBalance(intermediary1));

    assert.isTrue(
      intermediary1StartingBalance
      .add(new BN(90000))
      .sub(new BN(tx.receipt.gasUsed).mul(new BN(42)))
      .eq(intermediary1EndingBalance)
    );

    payment = await remittance.payments(paymentHash);

    assert.isTrue(payment.status.eq(statuses.Claimed));
  });

  it('should enable only payer to get a refund within refund window', async() => {
    let paymentHash = await remittance.deposit.call(
      intermediary1,
      '0xae3230e7df366e086e69d35dc2a1b614fb48339756a72741c39654a78c4c9489',
      '0x892a5c2516d3e850745f5788a81c679facc50c002f9326881f37106b02d85a61',
      86400 * 14,
      { from: payer1, value: 100000 }
    );

    await remittance.deposit(
      intermediary1,
      '0xae3230e7df366e086e69d35dc2a1b614fb48339756a72741c39654a78c4c9489',
      '0x892a5c2516d3e850745f5788a81c679facc50c002f9326881f37106b02d85a61',
      86400 * 14,
      { from: payer1, value: 100000 }
    );

    try {
      await remittance.refund(
        paymentHash,
        { from: payer2 }
      );
    } catch(err) {
      assert.strictEqual(err.reason, 'Only payer allowed');
    }

    paymentHash = await remittance.deposit.call(
      intermediary1,
      '0xae3230e7df366e086e69d35dc2a1b614fb48339756a72741c39654a78c4c9489',
      '0x892a5c2516d3e850745f5788a81c679facc50c002f9326881f37106b02d85a61',
      60,
      { from: payer1, value: 100000 }
    );

    await remittance.deposit(
      intermediary1,
      '0xae3230e7df366e086e69d35dc2a1b614fb48339756a72741c39654a78c4c9489',
      '0x892a5c2516d3e850745f5788a81c679facc50c002f9326881f37106b02d85a61',
      60,
      { from: payer1, value: 100000 }
    );

    try {
      await remittance.refund(
        paymentHash,
        { from: payer1 }
      );
    } catch(err) {
      assert.strictEqual(err.reason, 'Contract has not yet expired');
    }

    paymentHash = await remittance.deposit.call(
      intermediary1,
      '0xae3230e7df366e086e69d35dc2a1b614fb48339756a72741c39654a78c4c9489',
      '0x892a5c2516d3e850745f5788a81c679facc50c002f9326881f37106b02d85a61',
      60,
      { from: payer1, value: 100000 }
    );

    await remittance.deposit(
      intermediary1,
      '0xae3230e7df366e086e69d35dc2a1b614fb48339756a72741c39654a78c4c9489',
      '0x892a5c2516d3e850745f5788a81c679facc50c002f9326881f37106b02d85a61',
      60,
      { from: payer1, value: 100000 }
    );

    try {
      await web3.currentProvider.send(
        {
          jsonrpc: '2.0',
          method: 'evm_increaseTime',
          params: [86400 * 15],
          id: 0
        },
        () => {}
      );
      await remittance.refund(
        paymentHash,
        { from: payer1 }
      );
    } catch(err) {
      assert.strictEqual(err.reason, 'Refund deadline has already passed');
    }

    paymentHash = await remittance.deposit.call(
      intermediary1,
      '0xae3230e7df366e086e69d35dc2a1b614fb48339756a72741c39654a78c4c9489',
      '0x892a5c2516d3e850745f5788a81c679facc50c002f9326881f37106b02d85a61',
      60,
      { from: payer1, value: 100000 }
    );

    await remittance.deposit(
      intermediary1,
      '0xae3230e7df366e086e69d35dc2a1b614fb48339756a72741c39654a78c4c9489',
      '0x892a5c2516d3e850745f5788a81c679facc50c002f9326881f37106b02d85a61',
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
      paymentHash,
      { from: payer1, gasPrice: 42 }
    );

    let payer1EndingBalance = new BN(await web3.eth.getBalance(payer1));

    assert.isTrue(
      payer1StartingBalance
      .add(new BN(90000))
      .sub(new BN(tx.receipt.gasUsed).mul(new BN(42)))
      .eq(payer1EndingBalance)
    );
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
        intermediary1,
        '0xae3230e7df366e086e69d35dc2a1b614fb48339756a72741c39654a78c4c9489',
        '0x892a5c2516d3e850745f5788a81c679facc50c002f9326881f37106b02d85a61',
        60,
        { from: payer1, value: 100000 }
      );
    } catch(err) {
      assert.strictEqual(err.reason, 'Contract paused');
    }
  });

  it('should allow claiming even when paused', async() => {
    assert.isFalse(await remittance.isPaused());

    paymentHash = await remittance.deposit.call(
      intermediary1,
      '0xae3230e7df366e086e69d35dc2a1b614fb48339756a72741c39654a78c4c9489',
      '0x892a5c2516d3e850745f5788a81c679facc50c002f9326881f37106b02d85a61',
      60,
      { from: payer1, value: 100000 }
    );

    await remittance.deposit(
      intermediary1,
      '0xae3230e7df366e086e69d35dc2a1b614fb48339756a72741c39654a78c4c9489',
      '0x892a5c2516d3e850745f5788a81c679facc50c002f9326881f37106b02d85a61',
      60,
      { from: payer1, value: 100000 }
    );
    await remittance.pause({ from: owner });

    let intermediary1StartingBalance = new BN(await web3.eth.getBalance(intermediary1));

    let tx = await remittance.claim(
      paymentHash,
      web3.utils.padRight(web3.utils.toHex('blablacio')),
      web3.utils.padRight(web3.utils.toHex('oicalbalb')),
      { from: intermediary1, gasPrice: 42 }
    );

    let intermediary1EndingBalance = new BN(await web3.eth.getBalance(intermediary1));

    assert.isTrue(
      intermediary1StartingBalance
      .add(new BN(90000))
      .sub(new BN(tx.receipt.gasUsed).mul(new BN(42)))
      .eq(intermediary1EndingBalance)
    );
  });

  it('should not allow deposits or claims when contract is killed', async() => {
    assert.isFalse(await remittance.isKilled());

    paymentHash = await remittance.deposit.call(
      intermediary1,
      '0xae3230e7df366e086e69d35dc2a1b614fb48339756a72741c39654a78c4c9489',
      '0x892a5c2516d3e850745f5788a81c679facc50c002f9326881f37106b02d85a61',
      60,
      { from: payer1, value: 100000 }
    );

    await remittance.deposit(
      intermediary1,
      '0xae3230e7df366e086e69d35dc2a1b614fb48339756a72741c39654a78c4c9489',
      '0x892a5c2516d3e850745f5788a81c679facc50c002f9326881f37106b02d85a61',
      60,
      { from: payer1, value: 100000 }
    );

    let payment = await remittance.payments(paymentHash);
    assert.strictEqual(payment.payer, payer1);
    assert.strictEqual(payment.intermediary, intermediary1);
    assert.isTrue(payment.amount.add(new BN(10000)).eq(new BN(100000)));

    await remittance.pause({ from: owner });
    await remittance.kill({ from: owner });

    try {
      await remittance.deposit(
        intermediary1,
        '0xae3230e7df366e086e69d35dc2a1b614fb48339756a72741c39654a78c4c9489',
        '0x892a5c2516d3e850745f5788a81c679facc50c002f9326881f37106b02d85a61',
        60,
        { from: payer1, value: 100000 }
      );
    } catch(err) {
      assert.strictEqual(err.reason, 'Contract killed');
    }

    try {
      await remittance.claim(
        paymentHash,
        web3.utils.padRight(web3.utils.toHex('blablacio')),
        web3.utils.padRight(web3.utils.toHex('oicalbalb')),
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
