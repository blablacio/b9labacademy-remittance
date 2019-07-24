pragma solidity 0.5.8;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./Pausable.sol";

contract Remittance is Pausable {
    using SafeMath for uint;

    uint public commission;

    struct Payment {
        uint amount;
        address payable payer;
        uint expires;
    }
    mapping (bytes32 => Payment) public payments;

    event LogDeposited(address indexed payer, uint amount);
    event LogClaimed(address indexed intermediary, uint amount);
    event LogRefunded(address indexed payer, uint amount);
    event LogMessage(bytes32 message);
    event LogMessageA(address who);

    constructor(uint _commission, bool _paused) Pausable(_paused) public {
        commission = _commission;
    }

    function changeCommission(uint newCommission) external onlyOwner {
        commission = newCommission;
    }

    modifier coversCommission {
        require(msg.value > commission, 'You need to at least cover the commission');
        _;
    }

    function generatePasswordHash(
        bytes32 payeePassword,
        bytes32 intermediaryPassword
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                payeePassword,
                intermediaryPassword,
                address(this)
            )
        );
    }

    function deposit(
        address intermediary,
        bytes32 hashedPassword,
        uint expires
    ) external payable whenAlive whenRunning coversCommission returns (bytes32) {
        require(intermediary != address(0), 'Invalid intermediary');
        require(hashedPassword != '', 'Invalid password');
        require(expires < 86400 * 30, 'Expiry too far in the future');

        bytes32 id = keccak256(
            abi.encode(
                intermediary,
                hashedPassword
            )
        );

        require(payments[id].payer == address(0), 'This password has already been used!');

        payments[id] = Payment(
            msg.value.sub(commission),
            msg.sender,
            now.add(expires)
        );

        emit LogDeposited(msg.sender, msg.value);

        return id;
    }

    function claim(
        bytes32 payeePassword,
        bytes32 intermediaryPassword
    ) external whenAlive {
        bytes32 id = keccak256(
            abi.encode(
                msg.sender,
                this.generatePasswordHash(payeePassword, intermediaryPassword)
            )
        );

        uint amount = payments[id].amount;

        require(amount > 0, 'Wrong credentials or deposit already claimed');

        payments[id].amount = 0;

        emit LogClaimed(msg.sender, amount);

        msg.sender.transfer(amount);
    }

    function refund(
        bytes32 id
    ) external whenAlive {
        Payment memory payment = payments[id];

        require(msg.sender == payment.payer, 'Only payer allowed');
        require(payment.expires < now, 'Deposit has not yet expired');

        payments[id].amount = 0;

        emit LogRefunded(msg.sender, payment.amount);

        payment.payer.transfer(payment.amount);
    }
}
