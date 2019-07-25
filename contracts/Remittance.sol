pragma solidity 0.5.8;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./Pausable.sol";

contract Remittance is Pausable {
    using SafeMath for uint;

    uint public commission;
    uint public constant defaultExpiry = 86400 * 30;

    struct Payment {
        uint amount;
        address payable payer;
        uint expiry;
    }
    mapping (bytes32 => Payment) public payments;

    event LogDeposited(address indexed payer, uint amount);
    event LogClaimed(address indexed intermediary, uint amount);
    event LogRefunded(address indexed payer, uint amount);

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
        address intermediaryAddress,
        bytes32 payeePassword
    ) public view returns (bytes32) {
        require(intermediaryAddress != address(0), 'Invalid intermediary');

        return keccak256(
            abi.encode(
                intermediaryAddress,
                payeePassword,
                address(this)
            )
        );
    }

    function deposit(
        bytes32 hashedPassword,
        uint expiry
    ) external payable whenAlive whenRunning coversCommission returns (bytes32) {
        require(hashedPassword != '', 'Invalid password');
        require(expiry < defaultExpiry, 'Expiry must be less than 30 days');
        require(
            payments[hashedPassword].payer == address(0),
            'This password has already been used!'
        );

        payments[hashedPassword] = Payment(
            msg.value.sub(commission),
            msg.sender,
            now.add(expiry)
        );

        emit LogDeposited(msg.sender, msg.value);
    }

    function claim(
        bytes32 payeePassword
    ) external whenAlive {
        bytes32 hashedPassword = this.generatePasswordHash(msg.sender, payeePassword);
        uint amount = payments[hashedPassword].amount;

        require(amount > 0, 'Wrong credentials or deposit already claimed');

        payments[hashedPassword].amount = 0;
        payments[hashedPassword].expiry = 0;

        emit LogClaimed(msg.sender, amount);

        msg.sender.transfer(amount);
    }

    function refund(
        bytes32 hashedPassword
    ) external whenAlive {
        Payment memory payment = payments[hashedPassword];

        require(msg.sender == payment.payer, 'Only payer allowed');
        require(payment.amount > 0, 'Deposit already claimed');
        require(payment.expiry < now, 'Deposit has not yet expired');

        payments[hashedPassword].amount = 0;
        payments[hashedPassword].expiry = 0;

        emit LogRefunded(msg.sender, payment.amount);

        payment.payer.transfer(payment.amount);
    }
}
