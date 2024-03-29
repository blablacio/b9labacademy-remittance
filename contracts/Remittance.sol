pragma solidity 0.5.8;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./Pausable.sol";

contract Remittance is Pausable {
    using SafeMath for uint;

    uint public commission;
    uint public constant defaultExpiry = 30 days;

    struct Payment {
        uint amount;
        address payable payer;
        uint expiry;
    }
    mapping (bytes32 => Payment) public payments;

    event LogDeposited(address indexed payer, uint amount);
    event LogClaimed(address indexed intermediary, uint amount);
    event LogRefunded(address indexed payer, uint amount);
    event LogCommissionChanged(address indexed who, uint oldValue, uint newValue);

    constructor(uint _commission, bool _paused) Pausable(_paused) public {
        commission = _commission;
    }

    function changeCommission(uint newCommission) external onlyOwner {
        emit LogCommissionChanged(msg.sender, commission, newCommission);

        commission = newCommission;
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
    ) external payable whenAlive whenRunning {
        require(hashedPassword != '', 'Invalid password');
        require(expiry <= defaultExpiry, 'Expiry must be less than 30 days');
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
    ) external {
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
    ) external {
        require(msg.sender == payments[hashedPassword].payer, 'Only payer allowed');
        require(payments[hashedPassword].expiry <= now, 'Deposit has not yet expired');

        uint amount = payments[hashedPassword].amount;

        require(amount > 0, 'Deposit already claimed');

        payments[hashedPassword].amount = 0;
        payments[hashedPassword].expiry = 0;

        emit LogRefunded(msg.sender, amount);

        msg.sender.transfer(amount);
    }
}
