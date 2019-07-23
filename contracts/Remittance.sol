pragma solidity 0.5.8;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./Pausable.sol";

contract Remittance is Pausable {
    using SafeMath for uint256;

    uint256 paymentId;
    uint256 public deadlineDelta;
    uint32 public commission;

    enum Status { Pending, Claimed, Refunded }
    struct Payment {
        uint256 id;
        Status status;
        uint256 amount;
        address payable payer;
        address payable intermediary;
        bytes32 payeePassword;
        bytes32 intermediaryPassword;
        uint256 created;
        uint256 expires;
    }
    mapping (bytes32 => Payment) public payments;

    event LogPasswordGenerated(address indexed payer);
    event LogPasswordChecked(address indexed intermediary);
    event LogContractKilled(address indexed killer);
    event LogDeposited(address indexed payer, uint256 amount);
    event LogClaimed(address indexed intermediary, address indexed payer, uint256 amount);
    event LogRefunded(address indexed payer, uint256 amount);

    constructor(uint256 _deadlineDelta, uint32 _commission, bool _paused) Pausable(_paused) public {
        deadlineDelta = _deadlineDelta;
        commission = _commission;
    }

    function getStatus(bytes32 paymentHash) public view returns (Status) {
        return payments[paymentHash].status;
    }

    function changeDeadlineDelta(uint256 newDeadlineDelta) external onlyOwner {
        deadlineDelta = newDeadlineDelta;
    }

    function changeCommission(uint32 newCommission) external onlyOwner {
        commission = newCommission;
    }

    modifier coversCommission {
        require(msg.value > commission, 'You need to at least cover the commission');
        _;
    }

    function deposit(
        address payable intermediary,
        bytes32 payeePassword,
        bytes32 intermediaryPassword,
        uint256 expires
    ) external payable whenAlive whenRunning coversCommission returns (bytes32) {
        uint256 id = paymentId++;
        bytes32 paymentHash = keccak256(
            abi.encode(
                id,
                msg.value - commission,
                msg.sender,
                intermediary,
                payeePassword,
                intermediaryPassword,
                now,
                expires
            )
        );
        payments[paymentHash] = Payment(
            id,
            Status.Pending,
            msg.value - commission,
            msg.sender,
            intermediary,
            payeePassword,
            intermediaryPassword,
            now,
            expires
        );

        return paymentHash;
    }

    modifier onlyPayer(bytes32 paymentHash) {
        require(msg.sender == payments[paymentHash].payer, 'Only payer allowed');
        _;
    }

    modifier onlyPending(bytes32 paymentHash) {
        require(
            payments[paymentHash].status == Status.Pending,
            'Cannot make changes at this point'
        );
        _;
    }

    function changePayeePassword(
        bytes32 paymentHash,
        bytes32 newPassword
    ) external whenAlive onlyPayer(paymentHash) onlyPending(paymentHash) {
        payments[paymentHash].payeePassword = newPassword;
    }

    function changeIntermediaryPassword(
        bytes32 paymentHash,
        bytes32 newPassword
    ) external whenAlive onlyPayer(paymentHash) onlyPending(paymentHash) {
        payments[paymentHash].intermediaryPassword = newPassword;
    }

    modifier onlyIntermediary(bytes32 paymentHash) {
        require(msg.sender == payments[paymentHash].intermediary, 'Only intermediary allowed');
        _;
    }

    modifier passwordsMatch(
        bytes32 paymentHash,
        bytes32 payeePassword,
        bytes32 intermediaryPassword
    ) {
        Payment memory payment = payments[paymentHash];

        bytes32 payeeHash = keccak256(abi.encode(payeePassword));
        require(payment.payeePassword == payeeHash, 'Payee password does not match!');

        bytes32 intermediaryHash = keccak256(abi.encode(intermediaryPassword));
        require(
            payment.intermediaryPassword == intermediaryHash,
            'Intermediary password does not match!'
        );
        _;
    }

    function claim(
        bytes32 paymentHash,
        bytes32 payeePassword,
        bytes32 intermediaryPassword
    ) external whenAlive onlyIntermediary(paymentHash) passwordsMatch(paymentHash, payeePassword, intermediaryPassword) {
        Payment memory payment = payments[paymentHash];
        payments[paymentHash].status = Status.Claimed;

        emit LogClaimed(msg.sender, payment.payer, payment.amount);

        payment.intermediary.transfer(payment.amount);
    }

    modifier onlyAfterContractExpiry(bytes32 paymentHash) {
        Payment memory payment = payments[paymentHash];
        require(payment.created.add(payment.expires) < now, 'Contract has not yet expired');
        _;
    }

    modifier onlyBeforeDeadline(bytes32 paymentHash) {
        Payment memory payment = payments[paymentHash];
        require(
            payment.created.add(payment.expires).add(deadlineDelta) > now,
            'Refund deadline has already passed'
        );
        _;
    }

    function refund(
        bytes32 paymentHash
    ) external whenAlive onlyPayer(paymentHash) onlyAfterContractExpiry(paymentHash) onlyBeforeDeadline(paymentHash) {
        Payment memory payment = payments[paymentHash];
        payment.status = Status.Refunded;

        emit LogRefunded(msg.sender, payment.amount);

        payment.payer.transfer(payment.amount);
    }
}