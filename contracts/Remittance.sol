pragma solidity 0.5.8;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./Pausable.sol";

contract Remittance is Pausable {
    using SafeMath for uint256;

    uint256 public deadlineDelta;
    uint32 public commission;

    struct Payment {
        uint256 amount;
        address payable payer;
        uint256 expires;
    }
    mapping (bytes32 => Payment) public payments;

    event LogDeposited(address indexed payer, uint256 amount);
    event LogClaimed(address indexed intermediary, uint256 amount);
    event LogRefunded(address indexed payer, uint256 amount);

    constructor(uint256 _deadlineDelta, uint32 _commission, bool _paused) Pausable(_paused) public {
        deadlineDelta = _deadlineDelta;
        commission = _commission;
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
        address intermediary,
        bytes32 password,
        uint32 expires
    ) external payable whenAlive whenRunning coversCommission returns (bytes32) {
        bytes32 id = keccak256(
            abi.encode(
                password,
                intermediary
            )
        );

        require(payments[id].amount == 0, 'Duplicate payment');

        payments[id] = Payment(
            msg.value - commission,
            msg.sender,
            now + expires
        );

        emit LogDeposited(msg.sender, msg.value);

        return id;
    }

    function claim(
        bytes32 password
    ) external whenAlive {
        bytes32 id = keccak256(
            abi.encode(
                password,
                msg.sender
            )
        );

        Payment memory payment = payments[id];

        require(payment.amount > 0, 'Wrong credentials or deposit already claimed');
        require(payment.expires > now, 'Deposit already expired');

        delete payments[id];

        emit LogClaimed(msg.sender, payment.amount);

        msg.sender.transfer(payment.amount);
    }

    function refund(
        bytes32 id
    ) external whenAlive {
        Payment memory payment = payments[id];

        require(msg.sender == payment.payer, 'Only payer allowed');
        require(payment.expires < now, 'Deposit has not yet expired');
        require(payment.expires.add(deadlineDelta) > now, 'Refund deadline has already passed');

        delete payments[id];

        emit LogRefunded(msg.sender, payment.amount);

        payment.payer.transfer(payment.amount);
    }
}
